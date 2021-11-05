import { customElement } from "lit/decorators.js";
import { ColoredConsole } from "../util/console-color";
import { iterateReadableStream } from "improv-wifi-serial-sdk/dist/util";
import { sleep } from "../util/sleep";
import { Logger } from "../const";

@customElement("ewt-console")
export class EwtConsole extends HTMLElement {
  public port!: SerialPort;
  public logger!: Logger;

  private _console?: ColoredConsole;
  private _cancelConnection?: () => Promise<void>;

  public connectedCallback() {
    if (this._console) {
      return;
    }
    const shadowRoot = this.attachShadow({ mode: "open" });

    shadowRoot.innerHTML = `
      <style>
        :host, input, button {
          background-color: #1c1c1c;
          color: #ddd;
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier,
            monospace;
          line-height: 1.45;
        }
        .log {
          box-sizing: border-box;
          height: calc(100% - 28px);
          font-size: 12px;
          padding: 16px;
          overflow: auto;
          white-space: pre-wrap;
          overflow-wrap: break-word;
        }

        .log-bold {
          font-weight: bold;
        }
        .log-italic {
          font-style: italic;
        }
        .log-underline {
          text-decoration: underline;
        }
        .log-strikethrough {
          text-decoration: line-through;
        }
        .log-underline.log-strikethrough {
          text-decoration: underline line-through;
        }
        .log-secret {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
        .log-secret-redacted {
          opacity: 0;
          width: 1px;
          font-size: 1px;
        }
        .log-fg-black {
          color: rgb(128, 128, 128);
        }
        .log-fg-red {
          color: rgb(255, 0, 0);
        }
        .log-fg-green {
          color: rgb(0, 255, 0);
        }
        .log-fg-yellow {
          color: rgb(255, 255, 0);
        }
        .log-fg-blue {
          color: rgb(0, 0, 255);
        }
        .log-fg-magenta {
          color: rgb(255, 0, 255);
        }
        .log-fg-cyan {
          color: rgb(0, 255, 255);
        }
        .log-fg-white {
          color: rgb(187, 187, 187);
        }
        .log-bg-black {
          background-color: rgb(0, 0, 0);
        }
        .log-bg-red {
          background-color: rgb(255, 0, 0);
        }
        .log-bg-green {
          background-color: rgb(0, 255, 0);
        }
        .log-bg-yellow {
          background-color: rgb(255, 255, 0);
        }
        .log-bg-blue {
          background-color: rgb(0, 0, 255);
        }
        .log-bg-magenta {
          background-color: rgb(255, 0, 255);
        }
        .log-bg-cyan {
          background-color: rgb(0, 255, 255);
        }
        .log-bg-white {
          background-color: rgb(255, 255, 255);
        }
        form {
          display: flex;
          align-items: center;
          padding: 0 8px 0 16px;
        }
        input {
          flex: 1;
          padding: 4px;
          margin: 0 8px;
          border: 0;
          outline: none;
        }
        button {
          background-color: #ddd;
          border: 0;
          color: #1c1c1c;
        }
      </style>
      <div class="log"></div>
      <form>
        >
        <input autofocus>
        <button type="button">Send</button>
      </form>
    `;

    this._console = new ColoredConsole(this.shadowRoot!.querySelector("div")!);
    const input = this.shadowRoot!.querySelector("input")!;

    this.addEventListener("click", () => input.focus());

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        this._sendCommand();
      }
    });
    this.shadowRoot!.querySelector("button")!.addEventListener("click", () =>
      this._sendCommand()
    );

    const reader = this.port.readable!.getReader();
    const connection = this._connect(reader);
    this._cancelConnection = () => {
      reader.cancel();
      return connection;
    };
  }

  private async _connect(reader: ReadableStreamDefaultReader<Uint8Array>) {
    this.logger.debug("Starting console read loop");
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          this._console!.addLine("\r\n\r\nTerminal disconnected\r\n");
          break;
        }
        if (!value || value.length === 0) {
          continue;
        }
        this._console!.addLine(String.fromCodePoint(...value));
      }
    } catch (e) {
      this._console!.addLine(`\n\nTerminal disconnected: ${e}`);
    } finally {
      reader.releaseLock();
      await sleep(100);
      this.logger.debug("Finished console read loop");
    }
  }

  private async _sendCommand() {
    const input = this.shadowRoot!.querySelector("input")!;
    const command = input.value;
    const encoder = new TextEncoder();
    const writer = this.port.writable!.getWriter();
    await writer.write(encoder.encode(command));
    this._console!.addLine(`> ${command}\n`);
    input.value = "";
    input.focus();
    try {
      writer.releaseLock();
    } catch (err) {
      console.error("Ignoring release lock error", err);
    }
  }

  public async disconnect() {
    if (this._cancelConnection) {
      await this._cancelConnection();
      this._cancelConnection = undefined;
    }
  }

  public async reset() {
    this.logger.debug("Triggering reset.");
    await this.port.setSignals({
      dataTerminalReady: false,
      requestToSend: true,
    });
    await this.port.setSignals({
      dataTerminalReady: false,
      requestToSend: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ewt-console": EwtConsole;
  }
}

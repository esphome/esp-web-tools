import { ColoredConsole, coloredConsoleStyles } from "../util/console-color";
import { sleep } from "../util/sleep";
import { LineBreakTransformer } from "../util/line-break-transformer";
import { Logger } from "../const";

export class EwtConsole extends HTMLElement {
  public port!: SerialPort;
  public logger!: Logger;
  public allowInput = true;

  private _console?: ColoredConsole;
  private _cancelConnection?: () => Promise<void>;

  public connectedCallback() {
    if (this._console) {
      return;
    }
    const shadowRoot = this.attachShadow({ mode: "open" });

    shadowRoot.innerHTML = `
      <style>
        :host, input {
          background-color: #1c1c1c;
          color: #ddd;
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier,
            monospace;
          line-height: 1.45;
          display: flex;
          flex-direction: column;
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
        ${coloredConsoleStyles}
      </style>
      <div class="log"></div>
      ${
        this.allowInput
          ? `<form>
                >
                <input autofocus>
              </form>
            `
          : ""
      }
    `;

    this._console = new ColoredConsole(this.shadowRoot!.querySelector("div")!);

    if (this.allowInput) {
      const input = this.shadowRoot!.querySelector("input")!;

      this.addEventListener("click", () => {
        // Only focus input if user didn't select some text
        if (getSelection()?.toString() === "") {
          input.focus();
        }
      });

      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          ev.stopPropagation();
          this._sendCommand();
        }
      });
    }

    const abortController = new AbortController();
    const connection = this._connect(abortController.signal);
    this._cancelConnection = () => {
      abortController.abort();
      return connection;
    };
  }

  private async _connect(abortSignal: AbortSignal) {
    this.logger.debug("Starting console read loop");
    try {
      await this.port
        .readable!.pipeThrough(new TextDecoderStream(), {
          signal: abortSignal,
        })
        .pipeThrough(new TransformStream(new LineBreakTransformer()))
        .pipeTo(
          new WritableStream({
            write: (chunk) => {
              this._console!.addLine(chunk.replace("\r", ""));
            },
          })
        );
      if (!abortSignal.aborted) {
        this._console!.addLine("");
        this._console!.addLine("");
        this._console!.addLine("Terminal disconnected");
      }
    } catch (e) {
      this._console!.addLine("");
      this._console!.addLine("");
      this._console!.addLine(`Terminal disconnected: ${e}`);
    } finally {
      await sleep(100);
      this.logger.debug("Finished console read loop");
    }
  }

  private async _sendCommand() {
    const input = this.shadowRoot!.querySelector("input")!;
    const command = input.value;
    const encoder = new TextEncoder();
    const writer = this.port.writable!.getWriter();
    await writer.write(encoder.encode(command + "\r\n"));
    this._console!.addLine(`> ${command}\r\n`);
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

customElements.define("ewt-console", EwtConsole);

declare global {
  interface HTMLElementTagNameMap {
    "ewt-console": EwtConsole;
  }
}

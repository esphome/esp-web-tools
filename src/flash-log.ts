import { css, html, HTMLTemplateResult, LitElement, PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { Manifest } from "./const";
import { getChipFamilyName } from "./util";
import { ESPLoader } from "./vendor/esptool/esp_loader";

@customElement("esphome-web-flash-log")
class FlashLog extends LitElement {
  @property() public offerImprov = false;

  @property() public esploader?: ESPLoader;

  @property() public manifest?: Manifest;

  @property() public totalBytes?: number;

  @property() public bytesWritten?: number;

  @property() public extraMsg: string = "";

  @property() public errorMsg: string = "";

  @property() public allowClose = false;

  render() {
    if (!this.esploader) {
      return this._renderBody(["Establishing connection..."]);
    }

    const lines: Array<HTMLTemplateResult | string> = [
      html`Connection established<br />`,
    ];

    if (!this.esploader.chipFamily) {
      lines.push("Initializing...");
      return this._renderBody(lines);
    }

    lines.push(
      html`Initialized. Found ${getChipFamilyName(this.esploader)}<br />`
    );

    if (this.manifest === undefined) {
      lines.push(html`Fetching manifest...<br />`);
      return this._renderBody(lines);
    }

    lines.push(html`Found manifest for ${this.manifest.name}<br />`);

    if (!this.totalBytes) {
      return this._renderBody(lines);
    }

    lines.push(html`Bytes to be written: ${this.totalBytes}<br />`);

    if (!this.bytesWritten) {
      return this._renderBody(lines);
    }

    if (this.bytesWritten !== this.totalBytes) {
      lines.push(
        html`Writing progress:
          ${Math.floor((this.bytesWritten / this.totalBytes) * 100)}%<br />`
      );
      return this._renderBody(lines);
    }

    const doImprov =
      this.offerImprov &&
      customElements.get("improv-wifi-launch-button")?.isSupported;

    lines.push(html`Writing complete${doImprov ? "" : ", all done!"}<br />`);

    if (doImprov) {
      lines.push(html`
        <br />
        <improv-wifi-launch-button
          ><button slot="activate">
            Click here to finish setting up your device.
          </button></improv-wifi-launch-button
        >
      `);
    }

    return this._renderBody(lines, !doImprov);
  }

  private _renderBody(
    lines: Array<HTMLTemplateResult | string>,
    allowClose = false
  ) {
    // allow closing if esploader not connected
    // or we are at the end.
    // TODO force allow close if not connected
    return html`
      ${lines} ${this.extraMsg}
      ${allowClose
        ? html` <br /><button @click=${this._close}>Close this dialog</button> `
        : ""}
      ${this.errorMsg
        ? html`<div class="error">Error: ${this.errorMsg}</div>`
        : ""}
      ${this.esploader && !this.esploader.connected
        ? html`<div class="error">Connection lost</div>`
        : ""}
    `;
  }

  protected updated(props: PropertyValues) {
    super.updated(props);

    if (props.has("esploader") && this.esploader) {
      this.esploader.addEventListener("disconnect", () => this.requestUpdate());
    }
  }

  private _close() {
    this.parentElement?.removeChild(this);
  }

  static styles = css`
    :host {
      display: block;
      max-width: 500px;
      font-family: monospace;
      background-color: black;
      color: greenyellow;
      font-size: 14px;
      line-height: 19px;
      padding: 12px 16px;
    }

    button {
      background: none;
      color: inherit;
      border: none;
      padding: 0;
      font: inherit;
      text-align: left;
      text-decoration: underline;
      cursor: pointer;
    }

    .error {
      margin-top: 1em;
      color: red;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-web-flash-log": FlashLog;
  }
}

import { LitElement, html, css, TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { Transport, ESPLoader } from "esptool-js";
import "./components/ew-dialog";
import "./components/ew-text-button";
import "./components/ew-icon-button";
import "./pages/ewt-page-progress";
import "./pages/ewt-page-message";
import { closeIcon } from "./components/svg";
import { fireEvent } from "./util/fire-event";
import { parsePsramSizeFromFeatures } from "./util/build-match";
import { sleep } from "./util/sleep";
import { dialogStyles } from "./styles";

interface HardwareInfo {
  chipDescription: string;
  chipFeatures: string[];
  crystalFreqMhz: number;
  mac: string;
  flashSizeMB: number | null;
  psramSizeMB: number | null;
}

export class EwtDiagnosticsDialog extends LitElement {
  public port!: SerialPort;

  @state() private _state: "LOADING" | "INFO" | "ERROR" = "LOADING";
  @state() private _info?: HardwareInfo;
  @state() private _error?: string;

  private _bodyOverflow: string | null = null;

  protected override render() {
    let heading: string | undefined;
    let content: TemplateResult;
    let allowClosing = false;

    if (this._state === "LOADING") {
      content = html`
        <ewt-page-progress
          slot="content"
          .label=${"Reading hardware info..."}
        ></ewt-page-progress>
      `;
    } else if (this._state === "ERROR") {
      heading = "Error";
      allowClosing = true;
      content = html`
        <ewt-page-message
          slot="content"
          .icon=${"⚠️"}
          .label=${this._error!}
        ></ewt-page-message>
        <div slot="actions">
          <ew-text-button @click=${this._closeDialog}>Close</ew-text-button>
        </div>
      `;
    } else {
      heading = "Hardware Info";
      allowClosing = true;
      const info = this._info!;
      content = html`
        <div slot="content">
          <div class="info-table">
            <div class="row">
              <span class="label">Chip</span>
              <span class="value">${info.chipDescription}</span>
            </div>
            <div class="row">
              <span class="label">Features</span>
              <span class="value">${info.chipFeatures.join(", ") || "—"}</span>
            </div>
            <div class="row">
              <span class="label">Crystal</span>
              <span class="value">${info.crystalFreqMhz} MHz</span>
            </div>
            <div class="row">
              <span class="label">MAC Address</span>
              <span class="value">${info.mac}</span>
            </div>
            <div class="row">
              <span class="label">Flash Size</span>
              <span class="value"
                >${info.flashSizeMB != null
                  ? `${info.flashSizeMB} MB`
                  : "Unknown"}</span
              >
            </div>
            <div class="row">
              <span class="label">PSRAM Size</span>
              <span class="value"
                >${info.psramSizeMB != null
                  ? `${info.psramSizeMB} MB`
                  : "Not detected"}</span
              >
            </div>
          </div>
        </div>
        <div slot="actions">
          <ew-text-button @click=${this._closeDialog}>Close</ew-text-button>
        </div>
      `;
    }

    return html`
      <ew-dialog
        open
        .heading=${heading!}
        @cancel=${this._preventDefault}
        @closed=${this._handleClose}
      >
        ${heading ? html`<div slot="headline">${heading}</div>` : ""}
        ${allowClosing
          ? html`
              <ew-icon-button slot="headline" @click=${this._closeDialog}>
                ${closeIcon}
              </ew-icon-button>
            `
          : ""}
        ${content}
      </ew-dialog>
    `;
  }

  protected override async firstUpdated() {
    this._bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    await this._readHardwareInfo();
  }

  private async _readHardwareInfo() {
    // ESPLoader opens the port itself, so close it first.
    await this.port.close();

    const transport = new Transport(this.port);
    const esploader = new ESPLoader({
      transport,
      baudrate: 115200,
      romBaudrate: 115200,
      enableTracing: false,
    });

    try {
      await esploader.main();
      await esploader.flashId();
    } catch (err: any) {
      this._state = "ERROR";
      this._error =
        "Failed to connect. Try resetting your device or holding the BOOT button while connecting.";
      await transport.disconnect();
      return;
    }

    try {
      const chipDescription =
        await esploader.chip.getChipDescription(esploader);
      const chipFeatures = await esploader.chip.getChipFeatures(esploader);
      const crystalFreqMhz = await esploader.chip.getCrystalFreq(esploader);
      const mac = await esploader.chip.readMac(esploader);
      let flashSizeMB: number | null = null;
      try {
        const flashKB = await esploader.getFlashSize();
        flashSizeMB = flashKB / 1024;
      } catch {
        // flash size unavailable on some chips
      }
      const psramSizeMB = parsePsramSizeFromFeatures(chipFeatures) ?? null;

      this._info = {
        chipDescription,
        chipFeatures,
        crystalFreqMhz,
        mac,
        flashSizeMB,
        psramSizeMB,
      };
      this._state = "INFO";
    } catch (err: any) {
      this._state = "ERROR";
      this._error = `Failed to read hardware info: ${err.message}`;
    }

    try {
      await transport.setRTS(true);
      await sleep(100);
      await esploader.after();
    } catch {
      // ignore reset errors
    }
    await transport.disconnect();
  }

  private _closeDialog() {
    this.shadowRoot!.querySelector("ew-dialog")!.close();
  }

  private async _handleClose() {
    fireEvent(this, "closed" as any);
    document.body.style.overflow = this._bodyOverflow!;
    this.parentNode!.removeChild(this);
  }

  private _preventDefault(ev: Event) {
    ev.preventDefault();
  }

  static styles = [
    dialogStyles,
    css`
      :host {
        --mdc-dialog-max-width: 390px;
      }
      div[slot="headline"] {
        padding-right: 48px;
      }
      ew-icon-button[slot="headline"] {
        position: absolute;
        right: 4px;
        top: 8px;
      }
      ew-icon-button[slot="headline"] svg {
        padding: 8px;
        color: var(--text-color);
      }
      .info-table {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 4px 0;
      }
      .row {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .label {
        font-size: 11px;
        color: var(--text-color);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .value {
        font-size: 14px;
        color: rgba(0, 0, 0, 0.87);
        font-family: monospace;
        word-break: break-all;
      }
    `,
  ];
}

customElements.define("ewt-diagnostics-dialog", EwtDiagnosticsDialog);

declare global {
  interface HTMLElementTagNameMap {
    "ewt-diagnostics-dialog": EwtDiagnosticsDialog;
  }
}

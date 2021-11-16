import { LitElement, html, PropertyValues, css, TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import "./components/ewt-dialog";
import "./components/ewt-textfield";
import "./components/ewt-button";
import "./components/ewt-icon-button";
import "./components/ewt-circular-progress";
import type { EwtTextfield } from "./components/ewt-textfield";
import { Logger, Manifest, FlashStateType, FlashState } from "./const.js";
import { ImprovSerial } from "improv-wifi-serial-sdk/dist/serial";
import {
  ImprovSerialCurrentState,
  ImprovSerialErrorState,
  PortNotReady,
} from "improv-wifi-serial-sdk/dist/const";
import { fireEvent } from "./util/fire-event";
import { flash } from "./flash";
import "./components/ewt-console";
import { sleep } from "./util/sleep";

const ERROR_ICON = "⚠️";
const OK_ICON = "🎉";

const messageTemplate = (icon: string, label: string) => html`
  <div class="center">
    <div class="icon">${icon}</div>
    ${label}
  </div>
`;

class EwtInstallDialog extends LitElement {
  public port!: SerialPort;

  public manifestPath!: string;

  public logger: Logger = console;

  private _manifest!: Manifest;

  private _info?: ImprovSerial["info"];

  // null = NOT_SUPPORTED
  @state() private _client?: ImprovSerial | null;

  @state() private _state:
    | "ERROR"
    | "DASHBOARD"
    | "PROVISION"
    | "INSTALL"
    | "LOGS" = "DASHBOARD";

  @state() private _installErase = false;
  @state() private _installConfirmed = false;
  @state() private _installState?: FlashState;

  @state() private _provisionForce = false;
  private _wasProvisioned = false;

  @state() private _error?: string;

  @state() private _busy = false;

  protected render() {
    if (!this.port) {
      return html``;
    }
    let heading: string | undefined;
    let content: TemplateResult;
    let hideActions = false;
    let allowClosing = false;

    // During installation phase we temporarily remove the client
    if (
      this._client === undefined &&
      this._state !== "INSTALL" &&
      this._state !== "LOGS"
    ) {
      if (this._error) {
        content = this._renderMessage(ERROR_ICON, this._error, true);
      } else {
        content = this._renderProgress("Connecting");
        hideActions = true;
      }
    } else if (this._state === "INSTALL") {
      [heading, content, hideActions, allowClosing] = this._renderInstall();
    } else if (this._state === "ERROR") {
      heading = "Error";
      content = this._renderMessage(ERROR_ICON, this._error!, true);
    } else if (this._state === "DASHBOARD") {
      [heading, content, hideActions, allowClosing] = this._client
        ? this._renderDashboard()
        : this._renderDashboardNoImprov();
    } else if (this._state === "PROVISION") {
      [heading, content, hideActions] = this._renderProvision();
    } else if (this._state === "LOGS") {
      [heading, content, hideActions] = this._renderLogs();
    }

    return html`
      <ewt-dialog
        open
        .heading=${heading!}
        scrimClickAction
        @closed=${this._handleClose}
        .hideActions=${hideActions}
      >
        ${heading && allowClosing
          ? html`
              <ewt-icon-button dialogAction="close">
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path
                    d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"
                  />
                </svg>
              </ewt-icon-button>
            `
          : ""}
        ${content!}
      </ewt-dialog>
    `;
  }

  _renderProgress(label: string | TemplateResult, progress?: number) {
    return html`
      <div class="center">
        <div>
          <ewt-circular-progress
            active
            ?indeterminate=${progress === undefined}
            .progress=${progress !== undefined ? progress / 100 : undefined}
            density="8"
          ></ewt-circular-progress>
          ${progress !== undefined
            ? html`<div class="progress-pct">${progress}%</div>`
            : ""}
        </div>
        ${label}
      </div>
    `;
  }
  _renderMessage(icon: string, label: string, showClose: boolean) {
    return html`
      ${messageTemplate(icon, label)}
      ${showClose &&
      html`
        <ewt-button
          slot="primaryAction"
          dialogAction="ok"
          label="Close"
        ></ewt-button>
      `}
    `;
  }

  _renderDashboard(): [string, TemplateResult, boolean, boolean] {
    const heading = this._info!.name;
    let content: TemplateResult;
    let hideActions = true;
    let allowClosing = true;

    content = html`
      <table>
        <tr>
          <td>
            <svg viewBox="0 0 24 24" title="Software">
              <path
                fill="currentColor"
                d="M9.5,8.5L11,10L8,13L11,16L9.5,17.5L5,13L9.5,8.5M14.5,17.5L13,16L16,13L13,10L14.5,8.5L19,13L14.5,17.5M21,2H3A2,2 0 0,0 1,4V20A2,2 0 0,0 3,22H21A2,2 0 0,0 23,20V4A2,2 0 0,0 21,2M21,20H3V6H21V20Z"
              />
            </svg>
          </td>
          <td>${this._info!.firmware}&nbsp;${this._info!.version}</td>
        </tr>
        <tr>
          <td>
            <svg viewBox="0 0 24 24" title="Chipset">
              <path
                fill="currentColor"
                d="M6,4H18V5H21V7H18V9H21V11H18V13H21V15H18V17H21V19H18V20H6V19H3V17H6V15H3V13H6V11H3V9H6V7H3V5H6V4M11,15V18H12V15H11M13,15V18H14V15H13M15,15V18H16V15H15Z"
              />
            </svg>
          </td>
          <td>${this._info!.chipFamily}</td>
        </tr>
      </table>
      <div class="dashboard-buttons">
        ${!this._isSameVersion
          ? html`
              <div>
                <ewt-button
                  .label=${!this._isSameFirmware
                    ? `Install ${this._manifest!.name}`
                    : `Update ${this._manifest!.name}`}
                  @click=${() => this._startInstall(!this._isSameFirmware)}
                ></ewt-button>
              </div>
            `
          : ""}
        ${this._client!.nextUrl === undefined
          ? ""
          : html`
              <div>
                <a
                  href=${this._client!.nextUrl}
                  class="has-button"
                  target="_blank"
                >
                  <ewt-button label="Visit Device"></ewt-button>
                </a>
              </div>
            `}
        ${!this._manifest.home_assistant_domain ||
        this._client!.state !== ImprovSerialCurrentState.PROVISIONED
          ? ""
          : html`
              <div>
                <a
                  href=${`https://my.home-assistant.io/redirect/config_flow_start/?domain=${this._manifest.home_assistant_domain}`}
                  class="has-button"
                  target="_blank"
                >
                  <ewt-button label="Add to Home Assistant"></ewt-button>
                </a>
              </div>
            `}
        <div>
          <ewt-button
            .label=${this._client!.state === ImprovSerialCurrentState.READY
              ? "Connect to Wi-Fi"
              : "Change Wi-Fi"}
            @click=${() => {
              this._state = "PROVISION";
              if (
                this._client!.state === ImprovSerialCurrentState.PROVISIONED
              ) {
                this._provisionForce = true;
              }
            }}
          ></ewt-button>
        </div>
        <div>
          <ewt-button
            label="Logs & Console"
            @click=${async () => {
              const client = this._client;
              if (client) {
                await this._closeClientWithoutEvents(client);
                await sleep(100);
              }
              // Also set `null` back to undefined.
              this._client = undefined;
              this._state = "LOGS";
            }}
          ></ewt-button>
        </div>
        ${this._isSameVersion
          ? html`
              <div>
                <ewt-button
                  class="danger"
                  label="Reset Data"
                  @click=${() => this._startInstall(true)}
                ></ewt-button>
              </div>
            `
          : ""}
      </div>
    `;

    return [heading, content, hideActions, allowClosing];
  }
  _renderDashboardNoImprov(): [string, TemplateResult, boolean, boolean] {
    const heading = "Device Dashboard";
    let content: TemplateResult;
    let hideActions = true;
    let allowClosing = true;

    content = html`
      <div class="dashboard-buttons">
        <div>
          <ewt-button
            .label=${`Install ${this._manifest.name}`}
            @click=${() => this._startInstall(true)}
          ></ewt-button>
        </div>

        <div>
          <ewt-button
            label="Logs & Console"
            @click=${async () => {
              // Also set `null` back to undefined.
              this._client = undefined;
              this._state = "LOGS";
            }}
          ></ewt-button>
        </div>
      </div>
    `;

    return [heading, content, hideActions, allowClosing];
  }

  _renderProvision(): [string | undefined, TemplateResult, boolean] {
    let heading: string | undefined = "Configure Wi-Fi";
    let content: TemplateResult;
    let hideActions = false;

    if (this._busy) {
      return [heading, this._renderProgress("Trying to connect"), true];
    }

    if (
      !this._provisionForce &&
      this._client!.state === ImprovSerialCurrentState.PROVISIONED
    ) {
      heading = undefined;
      const showSetupLinks =
        !this._wasProvisioned &&
        (this._client!.nextUrl !== undefined ||
          "home_assistant_domain" in this._manifest);
      hideActions = showSetupLinks;
      content = html`
        ${messageTemplate(OK_ICON, "Device connected to the network!")}
        ${showSetupLinks
          ? html`
              <div class="dashboard-buttons">
                ${this._client!.nextUrl === undefined
                  ? ""
                  : html`
                      <div>
                        <a
                          href=${this._client!.nextUrl}
                          class="has-button"
                          target="_blank"
                          @click=${() => {
                            this._state = "DASHBOARD";
                          }}
                        >
                          <ewt-button label="Visit Device"></ewt-button>
                        </a>
                      </div>
                    `}
                ${!this._manifest.home_assistant_domain
                  ? ""
                  : html`
                      <div>
                        <a
                          href=${`https://my.home-assistant.io/redirect/config_flow_start/?domain=${this._manifest.home_assistant_domain}`}
                          class="has-button"
                          target="_blank"
                          @click=${() => {
                            this._state = "DASHBOARD";
                          }}
                        >
                          <ewt-button
                            label="Add to Home Assistant"
                          ></ewt-button>
                        </a>
                      </div>
                    `}
                <div>
                  <ewt-button
                    label="Skip"
                    @click=${() => {
                      this._state = "DASHBOARD";
                      this._installState = undefined;
                    }}
                  ></ewt-button>
                </div>
              </div>
            `
          : html`
              <ewt-button
                slot="primaryAction"
                label="Continue"
                @click=${() => {
                  this._state = "DASHBOARD";
                }}
              ></ewt-button>
            `}
      `;
    } else {
      let error: string | undefined;

      switch (this._client!.error) {
        case ImprovSerialErrorState.UNABLE_TO_CONNECT:
          error = "Unable to connect";
          break;

        case ImprovSerialErrorState.NO_ERROR:
          break;

        default:
          error = `Unknown error (${this._client!.error})`;
      }
      content = html`
        <div>
          Enter the credentials of the Wi-Fi network that you want your device
          to connect to.
        </div>
        ${error ? html`<p class="error">${error}</p>` : ""}
        <ewt-textfield label="Network Name" name="ssid"></ewt-textfield>
        <ewt-textfield
          label="Password"
          name="password"
          type="password"
        ></ewt-textfield>
        <ewt-button
          slot="primaryAction"
          label="Connect"
          @click="${this._doProvision}"
        ></ewt-button>
        <ewt-button
          slot="secondaryAction"
          .label=${this._installState && this._installErase ? "Skip" : "Back"}
          @click=${() => {
            this._installState = undefined;
            this._state = "DASHBOARD";
          }}
        ></ewt-button>
      `;
    }
    return [heading, content, hideActions];
  }

  _renderInstall(): [string | undefined, TemplateResult, boolean, boolean] {
    let heading: string | undefined = `${
      this._installConfirmed ? "Installing" : "Install"
    } ${this._manifest!.name}`;
    let content: TemplateResult;
    let hideActions = false;
    const allowClosing = false;

    const isUpdate = !this._installErase && this._isSameFirmware;

    if (!this._installConfirmed && this._isSameVersion) {
      heading = "Reset data";
      content = html`
        Do you want to reset your device and erase all existing data from your
        device?
        <ewt-button
          class="danger"
          slot="primaryAction"
          label="Reset data"
          @click=${this._confirmInstall}
        ></ewt-button>
      `;
    } else if (!this._installConfirmed) {
      const action = isUpdate ? "update to" : "install";
      content = html`
        ${isUpdate
          ? html`Your device is running
              ${this._info!.firmware}&nbsp;${this._info!.version}.<br /><br />`
          : ""}
        Do you want to ${action}
        ${this._manifest!.name}&nbsp;${this._manifest!.version}?
        ${this._installErase
          ? "All existing data will be erased from your device."
          : ""}
        <ewt-button
          slot="primaryAction"
          label="Install"
          @click=${this._confirmInstall}
        ></ewt-button>
        <ewt-button
          slot="secondaryAction"
          label="Back"
          @click=${() => {
            this._state = "DASHBOARD";
          }}
        ></ewt-button>
      `;
    } else if (
      !this._installState ||
      this._installState.state === FlashStateType.INITIALIZING ||
      this._installState.state === FlashStateType.MANIFEST ||
      this._installState.state === FlashStateType.PREPARING
    ) {
      content = this._renderProgress("Preparing installation");
      hideActions = true;
    } else if (this._installState.state === FlashStateType.ERASING) {
      content = this._renderProgress("Erasing");
      hideActions = true;
    } else if (
      this._installState.state === FlashStateType.WRITING ||
      // When we're finished, keep showing this screen with 100% written
      // until Improv is initialized / not detected.
      (this._installState.state === FlashStateType.FINISHED &&
        this._client === undefined)
    ) {
      let percentage: number | undefined;
      let undeterminateLabel: string | undefined;
      if (this._installState.state === FlashStateType.FINISHED) {
        // We're done writing and detecting improv, show spinner
        undeterminateLabel = "Wrapping up";
      } else if (this._installState.details.percentage < 4) {
        // We're writing the firmware under 4%, show spinner or else we don't show any pixels
        undeterminateLabel = "Installing";
      } else {
        // We're writing the firmware over 4%, show progress bar
        percentage = this._installState.details.percentage;
      }
      content = this._renderProgress(
        html`
          ${undeterminateLabel ? html`${undeterminateLabel}<br />` : ""}
          <br />
          This will take
          ${this._installState.chipFamily === "ESP8266"
            ? "a minute"
            : "2 minutes"}.<br />
          Keep this page visible to prevent slow down
        `,
        percentage
      );
      hideActions = true;
    } else if (this._installState.state === FlashStateType.FINISHED) {
      heading = undefined;
      const supportsImprov = this._client !== null;
      content = html`
        ${messageTemplate(OK_ICON, "Installation complete!")}
        <ewt-button
          slot="primaryAction"
          label="Next"
          @click=${() => {
            this._state =
              supportsImprov && this._installErase ? "PROVISION" : "DASHBOARD";
          }}
        ></ewt-button>
      `;
    } else if (this._installState.state === FlashStateType.ERROR) {
      content = html`
        ${messageTemplate(ERROR_ICON, this._installState.message)}
        <ewt-button
          slot="primaryAction"
          label="Back"
          @click=${async () => {
            this._initialize();
            this._state = "DASHBOARD";
            this._installState = undefined;
          }}
        ></ewt-button>
      `;
    }
    return [heading, content!, hideActions, allowClosing];
  }

  _renderLogs(): [string | undefined, TemplateResult, boolean] {
    let heading: string | undefined = `Logs`;
    let content: TemplateResult;
    let hideActions = false;

    content = html`
      <ewt-console .port=${this.port} .logger=${this.logger}></ewt-console>
      <ewt-button
        slot="primaryAction"
        label="Back"
        @click=${async () => {
          await this.shadowRoot!.querySelector("ewt-console")!.disconnect();
          this._state = "DASHBOARD";
          this._initialize();
        }}
      ></ewt-button>
      <ewt-button
        slot="secondaryAction"
        label="Reset Device"
        @click=${async () => {
          await this.shadowRoot!.querySelector("ewt-console")!.reset();
        }}
      ></ewt-button>
    `;

    return [heading, content!, hideActions];
  }

  public override willUpdate(changedProps: PropertyValues) {
    if (!changedProps.has("_state")) {
      return;
    }
    // Clear errors when changing between pages unless we change
    // to the error page.
    if (this._state !== "ERROR") {
      this._error = undefined;
    }
    if (this._state !== "PROVISION") {
      this._provisionForce = false;
    }
  }

  protected override firstUpdated(changedProps: PropertyValues) {
    super.firstUpdated(changedProps);
    this._initialize();
  }

  protected override updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    if (!changedProps.has("_state")) {
      return;
    }

    this.setAttribute("state", this._state);

    if (this._state === "PROVISION") {
      const textfield = this.shadowRoot!.querySelector("ewt-textfield");
      if (textfield) {
        textfield.updateComplete.then(() => textfield.focus());
      }
    } else if (this._state === "INSTALL") {
      this._installConfirmed = false;
      this._installState = undefined;
    }
  }

  private async _fetchManifest() {
    if (this._manifest) {
      return;
    }

    const manifestURL = new URL(
      this.manifestPath,
      location.toString()
    ).toString();
    this._manifest = await fetch(manifestURL).then(
      (resp): Promise<Manifest> => resp.json()
    );
  }

  private async _initialize(justErased = false) {
    if (this.port.readable === null || this.port.writable === null) {
      this._state = "ERROR";
      this._error =
        "Serial port is not readable/writable. Close any other application using it and try again.";
    }

    const manifestProm = this._fetchManifest();

    const client = new ImprovSerial(this.port!, this.logger);
    client.addEventListener("state-changed", () => {
      this.requestUpdate();
    });
    client.addEventListener("error-changed", () => this.requestUpdate());
    try {
      // If a device was just erased, the new firmware might need some time to
      // format the rest of the flash.
      const timeout = justErased ? 10000 : 1000;
      this._info = await client.initialize(timeout);
      this._client = client;
      client.addEventListener("disconnect", this._handleDisconnect);
    } catch (err: any) {
      // Clear old value
      this._info = undefined;
      if (err instanceof PortNotReady) {
        this._state = "ERROR";
        this._error =
          "Serial port is not ready. Close any other application using it and try again.";
      } else {
        this._client = null; // not supported
        this.logger.error("Improv initialization failed.", err);
      }
    }

    try {
      await manifestProm;
    } catch (err: any) {
      this._state = "ERROR";
      this._error = "Failed to download manifest";
    }
  }

  private _startInstall(erase: boolean) {
    this._state = "INSTALL";
    this._installErase = erase;
    this._installConfirmed = false;
  }

  private async _confirmInstall() {
    this._installConfirmed = true;
    this._installState = undefined;
    if (this._client) {
      await this._closeClientWithoutEvents(this._client);
    }
    this._client = undefined;

    flash(
      (state) => {
        this._installState = state;

        if (state.state === FlashStateType.FINISHED) {
          sleep(100)
            .then(() => this._initialize(this._installErase))
            .then(() => this.requestUpdate());
        }
      },
      this.port,
      this.logger,
      this.manifestPath,
      this._installErase
    );
  }

  private async _doProvision() {
    this._busy = true;
    this._wasProvisioned =
      this._client!.state === ImprovSerialCurrentState.PROVISIONED;
    const ssid = (
      this.shadowRoot!.querySelector("ewt-textfield[name=ssid]") as EwtTextfield
    ).value;
    const password = (
      this.shadowRoot!.querySelector(
        "ewt-textfield[name=password]"
      ) as EwtTextfield
    ).value;
    try {
      await this._client!.provision(ssid, password);
    } catch (err: any) {
      return;
    } finally {
      this._busy = false;
      this._provisionForce = false;
    }
  }

  private _handleDisconnect = () => {
    this._state = "ERROR";
    this._error = "Disconnected";
  };

  private async _handleClose() {
    if (this._client) {
      await this._closeClientWithoutEvents(this._client);
    }
    fireEvent(this, "closed" as any);
    this.parentNode!.removeChild(this);
  }

  /**
   * Return if the device runs same firmware as manifest.
   */
  private get _isSameFirmware() {
    return this._info?.firmware === this._manifest!.name;
  }

  /**
   * Return if the device runs same firmware and version as manifest.
   */
  private get _isSameVersion() {
    return (
      this._isSameFirmware && this._info!.version === this._manifest!.version
    );
  }

  private async _closeClientWithoutEvents(client: ImprovSerial) {
    client.removeEventListener("disconnect", this._handleDisconnect);
    await client.close();
  }

  static styles = css`
    :host {
      --mdc-dialog-max-width: 390px;
      --mdc-theme-primary: var(--improv-primary-color, #03a9f4);
      --mdc-theme-on-primary: var(--improv-on-primary-color, #fff);
      text-align: left;
    }
    ewt-icon-button {
      position: absolute;
      right: 4px;
      top: 10px;
    }
    table {
      border-spacing: 0;
      color: rgba(0, 0, 0, 0.6);
      margin-bottom: 16px;
    }
    table svg {
      width: 20px;
      margin-right: 8px;
    }
    ewt-textfield {
      display: block;
      margin-top: 16px;
    }
    .center {
      text-align: center;
    }
    .flash {
      font-weight: bold;
      margin-bottom: 1em;
      background-color: var(--mdc-theme-primary);
      padding: 8px 4px;
      color: var(--mdc-theme-on-primary);
      border-radius: 4px;
      text-align: center;
    }
    .dashboard-buttons {
      margin: 0 0 -16px -8px;
    }
    .dashboard-buttons div {
      display: block;
      margin: 4px 0;
    }
    ewt-circular-progress {
      margin-bottom: 16px;
    }
    a.has-button {
      text-decoration: none;
    }
    .icon {
      font-size: 50px;
      line-height: 80px;
      color: black;
    }
    .error {
      color: #db4437;
    }
    .danger {
      --mdc-theme-primary: #db4437;
    }
    button.link {
      background: none;
      color: inherit;
      border: none;
      padding: 0;
      font: inherit;
      text-align: left;
      text-decoration: underline;
      cursor: pointer;
    }
    :host([state="LOGS"]) ewt-dialog {
      --mdc-dialog-max-width: 90vw;
    }
    ewt-console {
      display: block;
      width: calc(80vw - 48px);
      height: 80vh;
    }
  `;
}

customElements.define("ewt-install-dialog", EwtInstallDialog);

declare global {
  interface HTMLElementTagNameMap {
    "ewt-install-dialog": EwtInstallDialog;
  }
}

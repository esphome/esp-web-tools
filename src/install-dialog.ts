import { LitElement, html, PropertyValues, css, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import "./components/ewt-dialog";
import "./components/ewt-textfield";
import "./components/ewt-button";
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

@customElement("ewt-install-dialog")
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
    | "CONSOLE" = "DASHBOARD";

  @state() private _installErase = false;
  @state() private _installConfirmed = false;
  @state() private _installState?: FlashState;

  @state() private _provisionForce = false;

  @state() private _error?: string;

  @state() private _busy = false;

  private _progressFeedback?: {
    resolve: (_: unknown) => void;
    reject: () => void;
  };

  protected render() {
    if (!this.port) {
      return html``;
    }
    let heading: string | undefined;
    let content: TemplateResult;
    let hideActions = false;

    // During installation phase we temporarily remove the client
    if (
      this._client === undefined &&
      this._state !== "INSTALL" &&
      this._state !== "CONSOLE"
    ) {
      if (this._error) {
        content = this._renderMessage(ERROR_ICON, this._error, true);
      } else {
        content = this._renderProgress("Connecting");
        hideActions = true;
      }
    } else if (this._state === "INSTALL") {
      [heading, content, hideActions] = this._renderInstall();
    } else if (this._state === "ERROR") {
      heading = "Error";
      content = this._renderMessage(ERROR_ICON, this._error!, true);
    } else if (this._state === "DASHBOARD") {
      [heading, content, hideActions] = this._renderDashboard();
    } else if (this._state === "PROVISION") {
      [heading, content, hideActions] = this._renderProvision();
    } else if (this._state === "CONSOLE") {
      [heading, content, hideActions] = this._renderConsole();
    }

    return html`
      <ewt-dialog
        open
        .heading=${heading!}
        scrimClickAction
        @closed=${this._handleClose}
        .hideActions=${hideActions}
        >${content!}</ewt-dialog
      >
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

  _renderDashboard(): [string, TemplateResult, boolean] {
    const heading = this._info!.name;
    let content: TemplateResult;
    let hideActions = true;

    const isSameFirmware = this._info!.firmware === this._manifest!.name;
    const isSameVersion =
      isSameFirmware && this._info!.version === this._manifest!.version;

    content = html`
      <div class="device-info">
        ${this._info!.firmware}&nbsp;${this._info!.version}
      </div>
      <div class="dashboard-buttons">
        <div>
          ${this._client!.nextUrl === undefined
            ? ""
            : html`
                <div>
                  <a
                    href=${this._client!.nextUrl}
                    class="has-button"
                    target="_blank"
                  >
                    <ewt-button label="Setup Device"></ewt-button>
                  </a>
                </div>
              `}
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
            .label=${isSameFirmware
              ? "Update"
              : `Install ${this._manifest!.name}`}
            @click=${() => this._startInstall(!isSameFirmware)}
            .disabled=${isSameVersion}
          ></ewt-button>
        </div>
        <div>
          <ewt-button
            label="Console"
            @click=${async () => {
              const client = this._client;
              if (client) {
                await this._closeClientWithoutEvents(client);
                await sleep(100);
              }
              // Also set `null` back to undefined.
              this._client = undefined;
              this._state = "CONSOLE";
            }}
          ></ewt-button>
        </div>
        <div>
          <ewt-button label="Close" dialogAction="close"></ewt-button>
        </div>
      </div>
    `;

    return [heading, content, hideActions];
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
      content = html`
        ${messageTemplate(OK_ICON, "Device connected to the network!")}
        ${
          // If we went to provision after installing the firmware with a full erase,
          // there is nothing left for the user, let them go to the device dashboard
          // if available
          this._installState?.state === FlashStateType.FINISHED &&
          this._installErase &&
          this._client!.nextUrl !== undefined
            ? html`
                <a
                  slot="primaryAction"
                  href=${this._client!.nextUrl}
                  class="has-button"
                  target="_blank"
                  @click=${() => {
                    this._state = "DASHBOARD";
                  }}
                >
                  <ewt-button label="Setup Device"></ewt-button>
                </a>
                <ewt-button
                  slot="secondaryAction"
                  label="Skip"
                  @click=${() => {
                    this._state = "DASHBOARD";
                    this._installState = undefined;
                  }}
                ></ewt-button>
              `
            : html`
                <ewt-button
                  slot="primaryAction"
                  label="Continue"
                  @click=${() => {
                    this._state = "DASHBOARD";
                  }}
                ></ewt-button>
              `
        }
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
          Enter the Wi-Fi credentials of the network that you want your device
          to connect to.
        </div>
        ${error ? html`<p class="error">${error}</p>` : ""}
        <ewt-textfield label="Wi-Fi SSID" name="ssid"></ewt-textfield>
        <ewt-textfield
          label="Wi-Fi password"
          name="password"
          type="password"
        ></ewt-textfield>
        <ewt-button
          slot="primaryAction"
          label="Save"
          @click="${this._doProvision}"
        ></ewt-button>
        <ewt-button
          slot="secondaryAction"
          label="Back"
          @click=${() => {
            this._state = "DASHBOARD";
          }}
        ></ewt-button>
      `;
    }
    return [heading, content, hideActions];
  }

  _renderInstall(): [string | undefined, TemplateResult, boolean] {
    let heading: string | undefined = `Install ${this._manifest!.name}`;
    let content: TemplateResult;
    let hideActions = false;

    const isUpdate = !this._installErase && this._isUpdate;

    if (!this._installConfirmed) {
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
        ${this._client
          ? html`
              <ewt-button
                slot="secondaryAction"
                label="Back"
                @click=${() => {
                  this._state = "DASHBOARD";
                }}
              ></ewt-button>
            `
          : html`
              <ewt-button
                slot="secondaryAction"
                label="Console"
                @click=${async () => {
                  // In case it was null
                  this._client = undefined;
                  this._state = "CONSOLE";
                }}
              ></ewt-button>
            `}
      `;
    } else if (
      !this._installState ||
      this._installState.state === FlashStateType.INITIALIZING ||
      this._installState.state === FlashStateType.MANIFEST ||
      this._installState.state === FlashStateType.PREPARING
    ) {
      content = this._renderProgress("Initializing installation");
      hideActions = true;
    } else if (this._installState.state === FlashStateType.ERASING) {
      content = this._renderProgress("Erasing");
      hideActions = true;
    } else if (this._installState.state === FlashStateType.WRITING) {
      content = this._renderProgress(
        html`
          ${this._installState.details.percentage > 3
            ? ""
            : html`Installing<br />`}
          <br />
          This will take
          ${this._installState.chipFamily === "ESP8266"
            ? "a minute"
            : "2 minutes"}.<br />
          Keep this page visible to prevent slow down
        `,
        // Show as undeterminate under 3% or else we don't show any pixels
        this._installState.details.percentage > 3
          ? this._installState.details.percentage
          : undefined
      );
      hideActions = true;
    } else if (this._installState.state === FlashStateType.FINISHED) {
      heading = undefined;
      const supportsImprov = this._client !== null;
      content = html`
        ${messageTemplate(OK_ICON, "Installation complete!")}
        <ewt-button
          slot="primaryAction"
          .label=${supportsImprov ? "Connect to Wi-Fi" : "Close"}
          dialogAction=${ifDefined(supportsImprov ? undefined : "close")}
          @click=${!supportsImprov
            ? undefined
            : () => {
                this._state = this._installErase ? "PROVISION" : "DASHBOARD";
              }}
        ></ewt-button>
        ${supportsImprov
          ? html`
              <ewt-button
                slot="secondaryAction"
                label="Skip"
                @click=${() => {
                  this._state = "DASHBOARD";
                  this._installState = undefined;
                }}
              ></ewt-button>
            `
          : ""}
      `;
    } else if (this._installState.state === FlashStateType.ERROR) {
      content = html`
        ${messageTemplate(ERROR_ICON, this._installState.message)}
        <ewt-button
          slot="primaryAction"
          label="Back"
          @click=${() => {
            if (this._client === null) {
              this._installConfirmed = false;
            } else {
              this._state = "DASHBOARD";
            }
            this._installState = undefined;
          }}
        ></ewt-button>
      `;
    }
    return [heading, content!, hideActions];
  }

  _renderConsole(): [string | undefined, TemplateResult, boolean] {
    let heading: string | undefined = `Console`;
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

  private async _initialize() {
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
      await client.initialize();
      this._info = client.info;
      this._client = client;
      client.addEventListener("disconnect", this._handleDisconnect);
    } catch (err: any) {
      if (err instanceof PortNotReady) {
        this._state = "ERROR";
        this._error =
          "Serial port is not ready. Close any other application using it and try again.";
      } else {
        this._client = null; // not supported
        this.logger.error("Improv initialization failed.", err);
        // initialize is also called at the end of an installation
        // When it can't detect improv (ie because install failed)
        // We shouldn't reset settings but instead show the error
        if (this._state !== "INSTALL") {
          this._startInstall(true);
        }
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

        if (
          state.state === FlashStateType.ERROR ||
          state.state === FlashStateType.FINISHED
        ) {
          this._initialize().then(() => this.requestUpdate());
        }
      },
      this.port,
      this.logger,
      this.manifestPath,
      false // TEMP, was `erase`
      // erase
    );
  }

  private async _doProvision() {
    this._busy = true;
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
    if (this._progressFeedback) {
      this._progressFeedback.reject();
    }
    if (this._client) {
      await this._closeClientWithoutEvents(this._client);
    }
    fireEvent(this, "closed" as any);
    this.parentNode!.removeChild(this);
  }

  private get _isUpdate() {
    return this._info?.firmware === this._manifest!.name;
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
      margin: 16px 0 -16px -8px;
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
    :host([state="CONSOLE"]) ewt-dialog {
      --mdc-dialog-max-width: 90vw;
    }
    ewt-console {
      display: block;
      width: calc(80vw - 48px);
      height: 80vh;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ewt-install-dialog": EwtInstallDialog;
  }
}

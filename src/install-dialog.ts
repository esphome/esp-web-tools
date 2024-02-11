import { LitElement, html, PropertyValues, css, TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import "./components/ew-text-button";
import "./components/ew-list";
import "./components/ew-list-item";
import "./components/ewt-checkbox";
import "./components/ewt-console";
import "./components/ewt-dialog";
import "./components/ewt-formfield";
import "./components/ew-icon-button";
import "./components/ew-textfield";
import type { EwTextfield } from "./components/ew-textfield";
import "./components/ew-filled-select";
import "./components/ew-select-option";
import "./pages/ewt-page-progress";
import "./pages/ewt-page-message";
import {
  chipIcon,
  closeIcon,
  firmwareIcon,
  refreshIcon,
} from "./components/svg";
import { Logger, Manifest, FlashStateType, FlashState } from "./const.js";
import { ImprovSerial, Ssid } from "improv-wifi-serial-sdk/dist/serial";
import {
  ImprovSerialCurrentState,
  ImprovSerialErrorState,
  PortNotReady,
} from "improv-wifi-serial-sdk/dist/const";
import { flash } from "./flash";
import { textDownload } from "./util/file-download";
import { fireEvent } from "./util/fire-event";
import { sleep } from "./util/sleep";
import { downloadManifest } from "./util/manifest";
import { dialogStyles } from "./styles";
import { version } from "./version";
import type { EwFilledSelect } from "./components/ew-filled-select";

console.log(
  `ESP Web Tools ${version} by Nabu Casa; https://esphome.github.io/esp-web-tools/`,
);

const ERROR_ICON = "⚠️";
const OK_ICON = "🎉";

export class EwtInstallDialog extends LitElement {
  public port!: SerialPort;

  public manifestPath!: string;

  public logger: Logger = console;

  public overrides?: {
    checkSameFirmware?: (
      manifest: Manifest,
      deviceImprov: ImprovSerial["info"],
    ) => boolean;
  };

  private _manifest!: Manifest;

  private _info?: ImprovSerial["info"];

  // null = NOT_SUPPORTED
  @state() private _client?: ImprovSerial | null;

  @state() private _state:
    | "ERROR"
    | "DASHBOARD"
    | "PROVISION"
    | "INSTALL"
    | "ASK_ERASE"
    | "LOGS" = "DASHBOARD";

  @state() private _installErase = false;
  @state() private _installConfirmed = false;
  @state() private _installState?: FlashState;

  @state() private _provisionForce = false;
  private _wasProvisioned = false;

  @state() private _error?: string;

  @state() private _busy = false;

  // undefined = not loaded
  // null = not available
  @state() private _ssids?: Ssid[] | null;

  // Name of Ssid. Null = other
  @state() private _selectedSsid: string | null = null;

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
        [heading, content, hideActions] = this._renderError(this._error);
      } else {
        content = this._renderProgress("Connecting");
        hideActions = true;
      }
    } else if (this._state === "INSTALL") {
      [heading, content, hideActions, allowClosing] = this._renderInstall();
    } else if (this._state === "ASK_ERASE") {
      [heading, content] = this._renderAskErase();
    } else if (this._state === "ERROR") {
      [heading, content, hideActions] = this._renderError(this._error!);
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
              <ew-icon-button dialogAction="close">
                ${closeIcon}
              </ew-icon-button>
            `
          : ""}
        ${content!}
      </ewt-dialog>
    `;
  }

  _renderProgress(label: string | TemplateResult, progress?: number) {
    return html`
      <ewt-page-progress
        .label=${label}
        .progress=${progress}
      ></ewt-page-progress>
    `;
  }

  _renderError(label: string): [string, TemplateResult, boolean] {
    const heading = "Error";
    const content = html`
      <ewt-page-message .icon=${ERROR_ICON} .label=${label}></ewt-page-message>
      <ew-text-button slot="primaryAction" dialogAction="ok">
        Close
      </ew-text-button>
    `;
    const hideActions = false;
    return [heading, content, hideActions];
  }

  _renderDashboard(): [string, TemplateResult, boolean, boolean] {
    const heading = this._info!.name;
    let content: TemplateResult;
    let hideActions = true;
    let allowClosing = true;

    content = html`
      <div class="table-row">
        ${firmwareIcon}
        <div>${this._info!.firmware}&nbsp;${this._info!.version}</div>
      </div>
      <div class="table-row last">
        ${chipIcon}
        <div>${this._info!.chipFamily}</div>
      </div>
      <ew-list>
        ${!this._isSameVersion
          ? html`
              <ew-list-item
                interactive
                type="button"
                @click=${() => {
                  if (this._isSameFirmware) {
                    this._startInstall(false);
                  } else if (this._manifest.new_install_prompt_erase) {
                    this._state = "ASK_ERASE";
                  } else {
                    this._startInstall(true);
                  }
                }}
              >
                <div slot="headline">
                  ${!this._isSameFirmware
                    ? `Install ${this._manifest.name}`
                    : `Update ${this._manifest.name}`}
                </div>
              </ew-list-item>
            `
          : ""}
        ${this._client!.nextUrl === undefined
          ? ""
          : html`
              <ew-list-item
                interactive
                type="link"
                href=${this._client!.nextUrl}
                target="_blank"
              >
                <div slot="headline">Visit Device</div>
              </ew-list-item>
            `}
        ${!this._manifest.home_assistant_domain ||
        this._client!.state !== ImprovSerialCurrentState.PROVISIONED
          ? ""
          : html`
              <ew-list-item
                interactive
                type="link"
                href=${`https://my.home-assistant.io/redirect/config_flow_start/?domain=${this._manifest.home_assistant_domain}`}
                target="_blank"
              >
                <div slot="headline">Add to Home Assistant</div>
              </ew-list-item>
            `}
        <ew-list-item
          interactive
          type="button"
          @click=${() => {
            this._state = "PROVISION";
            if (this._client!.state === ImprovSerialCurrentState.PROVISIONED) {
              this._provisionForce = true;
            }
          }}
        >
          <div slot="headline">
            ${this._client!.state === ImprovSerialCurrentState.READY
              ? "Connect to Wi-Fi"
              : "Change Wi-Fi"}
          </div>
        </ew-list-item>
        <ew-list-item
          interactive
          type="button"
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
        >
          <div slot="headline">Logs & Console</div>
        </ew-list-item>
        ${this._isSameFirmware && this._manifest.funding_url
          ? html`
              <ew-list-item
                interactive
                type="link"
                href=${this._manifest.funding_url}
                target="_blank"
              >
                <div slot="headline">Fund Development</div>
              </ew-list-item>
            `
          : ""}
        ${this._isSameVersion
          ? html`
              <ew-list-item
                interactive
                type="button"
                class="danger"
                @click=${() => this._startInstall(true)}
              >
                <div slot="headline">Erase User Data</div>
              </ew-list-item>
            `
          : ""}
      </ew-list>
    `;

    return [heading, content, hideActions, allowClosing];
  }
  _renderDashboardNoImprov(): [string, TemplateResult, boolean, boolean] {
    const heading = "Device Dashboard";
    let content: TemplateResult;
    let hideActions = true;
    let allowClosing = true;

    content = html`
      <ew-list>
        <ew-list-item
          interactive
          type="button"
          @click=${() => {
            if (this._manifest.new_install_prompt_erase) {
              this._state = "ASK_ERASE";
            } else {
              // Default is to erase a device that does not support Improv Serial
              this._startInstall(true);
            }
          }}
        >
          <div slot="headline">${`Install ${this._manifest.name}`}</div>
        </ew-list-item>
        <ew-list-item
          interactive
          type="button"
          @click=${async () => {
            // Also set `null` back to undefined.
            this._client = undefined;
            this._state = "LOGS";
          }}
        >
          <div slot="headline">Logs & Console</div>
        </ew-list-item>
      </ew-list>
    `;

    return [heading, content, hideActions, allowClosing];
  }

  _renderProvision(): [string | undefined, TemplateResult, boolean] {
    let heading: string | undefined = "Configure Wi-Fi";
    let content: TemplateResult;
    let hideActions = false;

    if (this._busy) {
      return [
        heading,
        this._renderProgress(
          this._ssids === undefined
            ? "Scanning for networks"
            : "Trying to connect",
        ),
        true,
      ];
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
        <ewt-page-message
          .icon=${OK_ICON}
          label="Device connected to the network!"
        ></ewt-page-message>
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
                          <ew-text-button>Visit Device</ew-text-button>
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
                          <ew-text-button>Add to Home Assistant</ew-text-button>
                        </a>
                      </div>
                    `}
                <div>
                  <ew-text-button
                    @click=${() => {
                      this._state = "DASHBOARD";
                    }}
                  >
                    Skip
                  </ew-text-button>
                </div>
              </div>
            `
          : html`
              <ew-text-button
                slot="primaryAction"
                @click=${() => {
                  this._state = "DASHBOARD";
                }}
              >
                Continue
              </ew-text-button>
            `}
      `;
    } else {
      let error: string | undefined;

      switch (this._client!.error) {
        case ImprovSerialErrorState.UNABLE_TO_CONNECT:
          error = "Unable to connect";
          break;

        case ImprovSerialErrorState.TIMEOUT:
          error = "Timeout";
          break;

        case ImprovSerialErrorState.NO_ERROR:
        // Happens when list SSIDs not supported.
        case ImprovSerialErrorState.UNKNOWN_RPC_COMMAND:
          break;

        default:
          error = `Unknown error (${this._client!.error})`;
      }
      const selectedSsid = this._ssids?.find(
        (info) => info.name === this._selectedSsid,
      );
      content = html`
        <div>
          Enter the credentials of the Wi-Fi network that you want your device
          to connect to.
        </div>
        ${error ? html`<p class="error">${error}</p>` : ""}
        ${this._ssids !== null
          ? html`
              <ew-filled-select
                menu-positioning="fixed"
                label="Network"
                @change=${(ev: { target: EwFilledSelect }) => {
                  const index = ev.target.selectedIndex;
                  // The "Join Other" item is always the last item.
                  this._selectedSsid =
                    index === this._ssids!.length
                      ? null
                      : this._ssids![index].name;
                }}
              >
                ${this._ssids!.map(
                  (info) => html`
                    <ew-select-option
                      .selected=${selectedSsid === info}
                      .value=${info.name}
                    >
                      ${info.name}
                    </ew-select-option>
                  `,
                )}
                <ew-select-option .selected=${!selectedSsid} value="-1">
                  Join other…
                </ew-select-option>
              </ew-filled-select>
              <ew-icon-button @click=${this._updateSsids}>
                ${refreshIcon}
              </ew-icon-button>
            `
          : ""}
        ${
          // Show input box if command not supported or "Join Other" selected
          !selectedSsid
            ? html`
                <ew-textfield label="Network Name" name="ssid"></ew-textfield>
              `
            : ""
        }
        ${!selectedSsid || selectedSsid.secured
          ? html`
              <ew-textfield
                label="Password"
                name="password"
                type="password"
              ></ew-textfield>
            `
          : ""}
        <ew-text-button slot="primaryAction" @click=${this._doProvision}>
          Connect
        </ew-text-button>
        <ew-text-button
          slot="secondaryAction"
          @click=${() => {
            this._state = "DASHBOARD";
          }}
        >
          ${this._installState && this._installErase ? "Skip" : "Back"}
        </ew-text-button>
      `;
    }
    return [heading, content, hideActions];
  }

  _renderAskErase(): [string | undefined, TemplateResult] {
    const heading = "Erase device";
    const content = html`
      <div>
        Do you want to erase the device before installing
        ${this._manifest.name}? All data on the device will be lost.
      </div>
      <ewt-formfield label="Erase device" class="danger">
        <ewt-checkbox></ewt-checkbox>
      </ewt-formfield>
      <ew-text-button
        slot="primaryAction"
        @click=${() => {
          const checkbox = this.shadowRoot!.querySelector("ewt-checkbox")!;
          this._startInstall(checkbox.checked);
        }}
      >
        Next
      </ew-text-button>
      <ew-text-button
        slot="secondaryAction"
        @click=${() => {
          this._state = "DASHBOARD";
        }}
      >
        Back
      </ew-text-button>
    `;

    return [heading, content];
  }

  _renderInstall(): [string | undefined, TemplateResult, boolean, boolean] {
    let heading: string | undefined;
    let content: TemplateResult;
    let hideActions = false;
    const allowClosing = false;

    const isUpdate = !this._installErase && this._isSameFirmware;

    if (!this._installConfirmed && this._isSameVersion) {
      heading = "Erase User Data";
      content = html`
        Do you want to reset your device and erase all user data from your
        device?
        <ew-text-button
          class="danger"
          slot="primaryAction"
          @click=${this._confirmInstall}
        >
          Erase User Data
        </ew-text-button>
      `;
    } else if (!this._installConfirmed) {
      heading = "Confirm Installation";
      const action = isUpdate ? "update to" : "install";
      content = html`
        ${isUpdate
          ? html`Your device is running
              ${this._info!.firmware}&nbsp;${this._info!.version}.<br /><br />`
          : ""}
        Do you want to ${action}
        ${this._manifest.name}&nbsp;${this._manifest.version}?
        ${this._installErase
          ? html`<br /><br />All data on the device will be erased.`
          : ""}
        <ew-text-button slot="primaryAction" @click=${this._confirmInstall}>
          Install
        </ew-text-button>
        <ew-text-button
          slot="secondaryAction"
          @click=${() => {
            this._state = "DASHBOARD";
          }}
        >
          Back
        </ew-text-button>
      `;
    } else if (
      !this._installState ||
      this._installState.state === FlashStateType.INITIALIZING ||
      this._installState.state === FlashStateType.PREPARING
    ) {
      heading = "Installing";
      content = this._renderProgress("Preparing installation");
      hideActions = true;
    } else if (this._installState.state === FlashStateType.ERASING) {
      heading = "Installing";
      content = this._renderProgress("Erasing");
      hideActions = true;
    } else if (
      this._installState.state === FlashStateType.WRITING ||
      // When we're finished, keep showing this screen with 100% written
      // until Improv is initialized / not detected.
      (this._installState.state === FlashStateType.FINISHED &&
        this._client === undefined)
    ) {
      heading = "Installing";
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
        percentage,
      );
      hideActions = true;
    } else if (this._installState.state === FlashStateType.FINISHED) {
      heading = undefined;
      const supportsImprov = this._client !== null;
      content = html`
        <ewt-page-message
          .icon=${OK_ICON}
          label="Installation complete!"
        ></ewt-page-message>
        <ew-text-button
          slot="primaryAction"
          @click=${() => {
            this._state =
              supportsImprov && this._installErase ? "PROVISION" : "DASHBOARD";
          }}
        >
          Next
        </ew-text-button>
      `;
    } else if (this._installState.state === FlashStateType.ERROR) {
      heading = "Installation failed";
      content = html`
        <ewt-page-message
          .icon=${ERROR_ICON}
          .label=${this._installState.message}
        ></ewt-page-message>
        <ew-text-button
          slot="primaryAction"
          @click=${async () => {
            this._initialize();
            this._state = "DASHBOARD";
          }}
        >
          Back
        </ew-text-button>
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
      <ew-text-button
        slot="primaryAction"
        @click=${async () => {
          await this.shadowRoot!.querySelector("ewt-console")!.disconnect();
          this._state = "DASHBOARD";
          this._initialize();
        }}
      >
        Back
      </ew-text-button>
      <ew-text-button
        slot="secondaryAction"
        label="Download Logs"
        @click=${() => {
          textDownload(
            this.shadowRoot!.querySelector("ewt-console")!.logs(),
            `esp-web-tools-logs.txt`,
          );

          this.shadowRoot!.querySelector("ewt-console")!.reset();
        }}
      ></ew-text-button>
      <ew-text-button
        slot="secondaryAction"
        @click=${async () => {
          await this.shadowRoot!.querySelector("ewt-console")!.reset();
        }}
      >
        Reset Device
      </ew-text-button>
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
    // Scan for SSIDs on provision
    if (this._state === "PROVISION") {
      this._updateSsids();
    } else {
      // Reset this value if we leave provisioning.
      this._provisionForce = false;
    }

    if (this._state === "INSTALL") {
      this._installConfirmed = false;
      this._installState = undefined;
    }
  }

  private async _updateSsids(tries = 0) {
    const oldSsids = this._ssids;
    this._ssids = undefined;
    this._busy = true;

    let ssids: Ssid[];

    try {
      ssids = await this._client!.scan();
    } catch (err) {
      // When we fail while loading, pick "Join other"
      if (this._ssids === undefined) {
        this._ssids = null;
        this._selectedSsid = null;
      }
      this._busy = false;
      return;
    }

    // We will retry a few times if we don't get any results
    if (ssids.length === 0 && tries < 3) {
      console.log("SCHEDULE RETRY", tries);
      setTimeout(() => this._updateSsids(tries + 1), 1000);
      return;
    }

    if (oldSsids) {
      // If we had a previous list, ensure the selection is still valid
      if (
        this._selectedSsid &&
        !ssids.find((s) => s.name === this._selectedSsid)
      ) {
        this._selectedSsid = ssids[0].name;
      }
    } else {
      this._selectedSsid = ssids.length ? ssids[0].name : null;
    }

    this._ssids = ssids;
    this._busy = false;
  }

  protected override firstUpdated(changedProps: PropertyValues) {
    super.firstUpdated(changedProps);
    this._initialize();
  }

  protected override updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    if (changedProps.has("_state")) {
      this.setAttribute("state", this._state);
    }

    if (this._state !== "PROVISION") {
      return;
    }

    if (changedProps.has("_selectedSsid") && this._selectedSsid === null) {
      // If we pick "Join other", select SSID input.
      this._focusFormElement("ew-textfield[name=ssid]");
    } else if (changedProps.has("_ssids")) {
      // Form is shown when SSIDs are loaded/marked not supported
      this._focusFormElement();
    }
  }

  private _focusFormElement(selector = "ew-textfield, ew-filled-select") {
    const formEl = this.shadowRoot!.querySelector(
      selector,
    ) as LitElement | null;
    if (formEl) {
      formEl.updateComplete.then(() => setTimeout(() => formEl.focus(), 100));
    }
  }

  private async _initialize(justInstalled = false) {
    if (this.port.readable === null || this.port.writable === null) {
      this._state = "ERROR";
      this._error =
        "Serial port is not readable/writable. Close any other application using it and try again.";
      return;
    }

    try {
      this._manifest = await downloadManifest(this.manifestPath);
    } catch (err: any) {
      this._state = "ERROR";
      this._error = "Failed to download manifest";
      return;
    }

    if (this._manifest.new_install_improv_wait_time === 0) {
      this._client = null;
      return;
    }

    const client = new ImprovSerial(this.port!, this.logger);
    client.addEventListener("state-changed", () => {
      this.requestUpdate();
    });
    client.addEventListener("error-changed", () => this.requestUpdate());
    try {
      // If a device was just installed, give new firmware 10 seconds (overridable) to
      // format the rest of the flash and do other stuff.
      const timeout = !justInstalled
        ? 1000
        : this._manifest.new_install_improv_wait_time !== undefined
          ? this._manifest.new_install_improv_wait_time * 1000
          : 10000;
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

    // Close port. ESPLoader likes opening it.
    await this.port.close();
    flash(
      (state) => {
        this._installState = state;

        if (state.state === FlashStateType.FINISHED) {
          sleep(100)
            // Flashing closes the port
            .then(() => this.port.open({ baudRate: 115200 }))
            .then(() => this._initialize(true))
            .then(() => this.requestUpdate());
        } else if (state.state === FlashStateType.ERROR) {
          sleep(100)
            // Flashing closes the port
            .then(() => this.port.open({ baudRate: 115200 }));
        }
      },
      this.port,
      this.manifestPath,
      this._manifest,
      this._installErase,
    );
    // YOLO2
  }

  private async _doProvision() {
    this._busy = true;
    this._wasProvisioned =
      this._client!.state === ImprovSerialCurrentState.PROVISIONED;
    const ssid =
      this._selectedSsid === null
        ? (
            this.shadowRoot!.querySelector(
              "ew-textfield[name=ssid]",
            ) as EwTextfield
          ).value
        : this._selectedSsid;
    const password =
      (
        this.shadowRoot!.querySelector(
          "ew-textfield[name=password]",
        ) as EwTextfield | null
      )?.value || "";
    try {
      await this._client!.provision(ssid, password, 30000);
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
    return !this._info
      ? false
      : this.overrides?.checkSameFirmware
        ? this.overrides.checkSameFirmware(this._manifest, this._info)
        : this._info.firmware === this._manifest.name;
  }

  /**
   * Return if the device runs same firmware and version as manifest.
   */
  private get _isSameVersion() {
    return (
      this._isSameFirmware && this._info!.version === this._manifest.version
    );
  }

  private async _closeClientWithoutEvents(client: ImprovSerial) {
    client.removeEventListener("disconnect", this._handleDisconnect);
    await client.close();
  }

  static styles = [
    dialogStyles,
    css`
      :host {
        --mdc-dialog-max-width: 390px;
      }
      ew-icon-button {
        position: absolute;
        right: 4px;
        top: 10px;
      }
      .table-row {
        display: flex;
      }
      .table-row.last {
        margin-bottom: 16px;
      }
      .table-row svg {
        width: 20px;
        margin-right: 8px;
      }
      ew-textfield,
      ew-filled-select {
        display: block;
        margin-top: 16px;
      }
      .dashboard-buttons {
        margin: 0 0 -16px -8px;
      }
      .dashboard-buttons div {
        display: block;
        margin: 4px 0;
      }
      a.has-button {
        text-decoration: none;
      }
      .error {
        color: var(--danger-color);
      }
      .danger {
        --mdc-theme-primary: var(--danger-color);
        --mdc-theme-secondary: var(--danger-color);
        --md-sys-color-primary: var(--danger-color);
        --md-sys-color-on-surface: var(--danger-color);
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
        width: calc(80vw - 48px);
        height: 80vh;
      }
      ew-select-option[value="-1"] {
        border-top: 1px solid #ccc;
      }
    `,
  ];
}

customElements.define("ewt-install-dialog", EwtInstallDialog);

declare global {
  interface HTMLElementTagNameMap {
    "ewt-install-dialog": EwtInstallDialog;
  }
}

import { FlashState, State } from "./const";
import { FlashLog } from "./flash-log";
import { FlashProgress } from "./flash-progress";

class InstallButton extends HTMLElement {
  public static isSupported = "serial" in navigator;

  public manifest?: string;

  public eraseFirst?: boolean;

  public hideProgress?: boolean;

  public showLog?: boolean;

  public state?: FlashState;

  private _logEl?: FlashLog;

  private _progressEl?: FlashProgress;

  private _renderRoot?: ShadowRoot;

  public static preload() {
    import("./start-flash");
    import("./flash-log");
    import("./flash-progress");
  }

  public connectedCallback() {
    if (this._renderRoot) {
      return;
    }

    this._renderRoot = this.attachShadow({ mode: "open" });

    if (!InstallButton.isSupported) {
      this.setAttribute("install-unsupported", "");
      this._renderRoot.innerHTML =
        "<slot name='unsupported'>Your browser does not support installing things on ESP devices. Use Google Chrome or Microsoft Edge.</slot>";
      return;
    }

    this.setAttribute("install-supported", "");

    this.addEventListener("mouseover", InstallButton.preload);

    this.addEventListener("state-changed", (ev) => {
      this.state = ev.detail;
      if (this.state.state === State.INITIALIZING) {
        this.setAttribute("disabled", "");
        const button = this._renderRoot!.querySelector("button");
        if (button) {
          button.disabled = true;
        }
      } else if (
        this.state.state === State.ERROR ||
        this.state.state === State.FINISHED
      ) {
        this.removeAttribute("disabled");
        const button = this._renderRoot!.querySelector("button");
        if (button) {
          button.disabled = false;
        }
      }
      this._progressEl?.processState(ev.detail);
      this._logEl?.processState(ev.detail);
    });

    this.addEventListener("click", async (ev) => {
      ev.preventDefault();
      if (this.hasAttribute("disabled")) {
        return;
      }

      const manifest = this.manifest || this.getAttribute("manifest");
      if (!manifest) {
        alert("No manifest defined!");
        return;
      }

      const showLog = this.showLog || this.hasAttribute("show-log");
      const showProgress =
        !showLog &&
        this.hideProgress !== true &&
        !this.hasAttribute("hide-progress");

      const [mod] = await Promise.all([
        import("./start-flash"),
        showLog ? import("./flash-log") : undefined,
        showProgress ? import("./flash-progress") : undefined,
      ]);

      if (showLog && !this._logEl) {
        this._logEl = this._addElement<FlashLog>(
          document.createElement("esp-web-flash-log")
        );
      } else if (!showLog && this._logEl) {
        this._logEl.remove();
        this._logEl = undefined;
      }

      if (showProgress && !this._progressEl) {
        this._progressEl = this._addElement<FlashProgress>(
          document.createElement("esp-web-flash-progress")
        );
      } else if (!showProgress && this._progressEl) {
        this._progressEl.remove();
        this._progressEl = undefined;
      }

      this._logEl?.clear();
      this._progressEl?.clear();

      await mod.startFlash(
        this,
        console,
        manifest,
        this.eraseFirst !== undefined
          ? this.eraseFirst
          : this.hasAttribute("erase-first"),
        (el) => this._addElement(el)
      );
    });

    this._renderRoot.innerHTML = `<slot name='activate'><button>Install</button></slot>`;
  }

  private _addElement<T extends HTMLElement>(element: T): T {
    this.parentElement!.insertBefore(element, this.nextSibling);
    return element;
  }
}

customElements.define("esp-web-install-button", InstallButton);

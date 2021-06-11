import { FlashState } from "./const";

export class InstallButton extends HTMLElement {
  public static isSupported = "serial" in navigator;

  public manifest?: string;

  public eraseFirst?: boolean;

  public hideProgress?: boolean;

  public showLog?: boolean;

  public state?: FlashState;

  public renderRoot?: ShadowRoot;

  public static preload() {
    import("./start-flash");
  }

  public connectedCallback() {
    if (this.renderRoot) {
      return;
    }

    this.renderRoot = this.attachShadow({ mode: "open" });

    if (!InstallButton.isSupported) {
      this.toggleAttribute("install-unsupported", true);
      this.renderRoot.innerHTML =
        "<slot name='unsupported'>Your browser does not support installing things on ESP devices. Use Google Chrome or Microsoft Edge.</slot>";
      return;
    }

    this.toggleAttribute("install-supported", true);

    this.addEventListener("mouseover", InstallButton.preload);

    this.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const mod = await import("./start-flash");
      mod.startFlash(this);
    });

    this.renderRoot.innerHTML = `<slot name='activate'><button>Install</button></slot>`;
  }
}

customElements.define("esp-web-install-button", InstallButton);

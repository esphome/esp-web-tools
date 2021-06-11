import { FlashState } from "./const";

export class InstallButton extends HTMLElement {
  public static isSupported = "serial" in navigator;

  private static style = `
  button {
    position: relative;
    cursor: pointer;
    height: 32px;
    line-height: 32px;
    font-size: 14px;
    padding: 0 28px;
    color: var(--esp-tools-button-text-color, #fff);
    background-color: var(--esp-tools-button-color, #03a9f4);
    text-align: center;
    border: none;
    border-radius: 4px;
    box-shadow: 0 2px 2px 0 rgba(0,0,0,.14), 0 3px 1px -2px rgba(0,0,0,.12), 0 1px 5px 0 rgba(0,0,0,.2);
  }
  button::before {
    content: " ";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    opacity: 0.2;
    border-radius: 4px;
  }
  button:hover {
    box-shadow: 0 4px 8px 0 rgba(0,0,0,.14), 0 1px 7px 0 rgba(0,0,0,.12), 0 3px 1px -1px rgba(0,0,0,.2);
  }
  button:hover::before {
    background-color: rgba(255,255,255,.8);
  }
  button:focus {
    outline: none;
  }
  button:focus::before {
    background-color: white;
  }
  button:active::before {
    background-color: grey;
  }
  :host([disabled]) button {
    color: #969696;
    background-color: #b7b7b7;
    cursor: unset;
    pointer-events: none;
  }
  improv-wifi-launch-button {
    display: block;
    margin-top: 16px;
  }
  .hidden {
    display: none;
  }`;

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
      const slot = document.createElement("slot");
      slot.name = "unsupported";
      slot.innerText =
        "Your browser does not support installing things on ESP devices. Use Google Chrome or Microsoft Edge.";
      this.renderRoot.append(slot);
      return;
    }

    this.toggleAttribute("install-supported", true);

    this.addEventListener("mouseover", InstallButton.preload);

    const container = document.createElement("span");

    container.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const mod = await import("./start-flash");
      mod.startFlash(this);
    });

    const slot = document.createElement("slot");
    slot.name = "activate";
    const button = document.createElement("button");
    button.innerText = "INSTALL";
    slot.append(button);
    container.append(slot);
    if (
      "adoptedStyleSheets" in Document.prototype &&
      "replaceSync" in CSSStyleSheet.prototype
    ) {
      const sheet = new CSSStyleSheet();
      // @ts-expect-error
      sheet.replaceSync(InstallButton.style);
      // @ts-expect-error
      this.renderRoot.adoptedStyleSheets = [sheet];
    } else {
      const styleSheet = document.createElement("style");
      styleSheet.innerText = InstallButton.style;
      this.renderRoot.append(styleSheet);
    }
    this.renderRoot.append(container);
  }
}

customElements.define("esp-web-install-button", InstallButton);

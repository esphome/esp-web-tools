export class DiagnosticsButton extends HTMLElement {
  public static isSupported = "serial" in navigator;

  public static isAllowed = window.isSecureContext;

  private static style = `
  button {
    position: relative;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    padding: 10px 24px;
    color: var(--esp-tools-button-text-color, #fff);
    background-color: var(--esp-tools-button-color, #03a9f4);
    border: none;
    border-radius: var(--esp-tools-button-border-radius, 9999px);
  }
  button::before {
    content: " ";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    opacity: 0.2;
    border-radius: var(--esp-tools-button-border-radius, 9999px);
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
  :host([active]) button {
    color: rgba(0, 0, 0, 0.38);
    background-color: rgba(0, 0, 0, 0.12);
    box-shadow: none;
    cursor: unset;
    pointer-events: none;
  }
  .hidden {
    display: none;
  }`;

  public renderRoot?: ShadowRoot;

  public connectedCallback() {
    if (this.renderRoot) {
      return;
    }

    this.renderRoot = this.attachShadow({ mode: "open" });

    if (!DiagnosticsButton.isSupported || !DiagnosticsButton.isAllowed) {
      this.toggleAttribute("install-unsupported", true);
      this.renderRoot.innerHTML = !DiagnosticsButton.isAllowed
        ? "<slot name='not-allowed'>You can only use this on HTTPS websites or on localhost.</slot>"
        : "<slot name='unsupported'>Your browser does not support Web Serial. Use Google Chrome or Microsoft Edge.</slot>";
      return;
    }

    this.toggleAttribute("install-supported", true);

    const slot = document.createElement("slot");

    slot.addEventListener("click", (ev) => {
      ev.preventDefault();
      this._connect();
    });

    slot.name = "activate";
    const button = document.createElement("button");
    button.innerText = "Diagnostics";
    slot.append(button);

    if (
      "adoptedStyleSheets" in Document.prototype &&
      "replaceSync" in CSSStyleSheet.prototype
    ) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(DiagnosticsButton.style);
      this.renderRoot.adoptedStyleSheets = [sheet];
    } else {
      const styleSheet = document.createElement("style");
      styleSheet.innerText = DiagnosticsButton.style;
      this.renderRoot.append(styleSheet);
    }
    this.renderRoot.append(slot);
  }

  private async _connect() {
    import("./diagnostics-dialog.js");
    let port: SerialPort | undefined;
    try {
      port = await navigator.serial.requestPort();
    } catch (err: any) {
      if ((err as DOMException).name !== "NotFoundError") {
        alert(`Error: ${err.message}`);
      }
      return;
    }

    if (!port) {
      return;
    }

    try {
      await port.open({ baudRate: 115200, bufferSize: 8192 });
    } catch (err: any) {
      alert(err.message);
      return;
    }

    const el = document.createElement("ewt-diagnostics-dialog");
    (el as any).port = port;
    el.addEventListener(
      "closed",
      async () => {
        // Port is closed by the dialog via transport.disconnect(); ignore if already closed.
        try {
          await port!.close();
        } catch {
          // already closed
        }
      },
      { once: true },
    );
    document.body.appendChild(el);
  }
}

customElements.define("esp-web-diagnostics-button", DiagnosticsButton);

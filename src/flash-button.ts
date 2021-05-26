import "./vendor/esptool";

class FlashButton extends HTMLElement {
  public static isSupported = "serial" in navigator;

  private renderRoot?: ShadowRoot;

  public connectedCallback() {
    if (this.renderRoot) {
      return;
    }

    this.renderRoot = this.attachShadow({ mode: "open" });

    if (FlashButton.isSupported) {
      this.addEventListener("mouseover", () => {
        // Preload
        import("./start-flash");
      });
      this.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const manifest = this.getAttribute("manifest");
        if (!manifest) {
          alert("No manifest defined!");
          return;
        }

        const mod = await import("./start-flash");

        const progress = document.createElement("div");
        document.body.append(progress);

        await mod.startFlash(console, manifest, progress);
      });
    }

    this.renderRoot.innerHTML = FlashButton.isSupported
      ? "<slot name='activate'><button>Flash device</button></slot>"
      : "<slot name='unsupported'>Your browser does not support flashing ESP devices. Use Google Chrome or Microsoft Edge.</slot>";
  }
}

customElements.define("esphome-web-flash-button", FlashButton);

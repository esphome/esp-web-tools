class InstallButton extends HTMLElement {
  public static isSupported = "serial" in navigator;

  public eraseFirst?: boolean;

  private renderRoot?: ShadowRoot;

  public connectedCallback() {
    if (this.renderRoot) {
      return;
    }

    this.renderRoot = this.attachShadow({ mode: "open" });

    if (!InstallButton.isSupported) {
      this.renderRoot.innerHTML =
        "<slot name='unsupported'>Your browser does not support installing things on ESP devices. Use Google Chrome or Microsoft Edge.</slot>";
      return;
    }

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

      await mod.startFlash(
        console,
        manifest,
        progress,
        this.eraseFirst !== undefined
          ? this.eraseFirst
          : this.hasAttribute("erase-first")
      );
    });

    this.renderRoot.innerHTML = `<slot name='activate'><button>Install</button></slot>`;
  }
}

customElements.define("esphome-web-install-button", InstallButton);

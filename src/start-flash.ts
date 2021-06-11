import { flash } from "./flash";
import "./flash-log";
import "./flash-progress";
import type { FlashLog } from "./flash-log";
import type { FlashProgress } from "./flash-progress";
import type { InstallButton } from "./install-button";
import { Build, State } from "./const";

let stateListnerAdded = false;

let logEl: FlashLog | undefined;

let progressEl: FlashProgress | undefined;

const addElement = <T extends HTMLElement>(
  button: InstallButton,
  element: T
): T => {
  let before = button.nextSibling;
  if (
    before &&
    ["ESP-WEB-FLASH-PROGRESS", "ESP-WEB-FLASH-LOG"].includes(before.nodeName)
  ) {
    before = before.nextSibling;
  }
  button.parentElement!.insertBefore(element, before);
  return element;
};

export const startFlash = async (button: InstallButton) => {
  if (button.hasAttribute("disabled")) {
    return;
  }

  const manifest = button.manifest || button.getAttribute("manifest");
  if (!manifest) {
    alert("No manifest defined!");
    return;
  }

  let hasImprov = false;

  if (!stateListnerAdded) {
    stateListnerAdded = true;
    button.addEventListener("state-changed", (ev) => {
      button.state = ev.detail;
      if (button.state.state === State.INITIALIZING) {
        button.toggleAttribute("disabled", true);
        button.renderRoot!.querySelector("button")!.disabled = true;
      } else if (button.state.state === State.ERROR) {
        button.toggleAttribute("disabled", false);
        button.renderRoot!.querySelector("button")!.disabled = false;
      } else if (button.state.state === State.FINISHED) {
        button.toggleAttribute("disabled", false);
        button.renderRoot!.querySelector("button")!.disabled = false;
        if (hasImprov) {
          startImprov(button);
        }
      } else if (button.state.state === State.MANIFEST && ev.detail.manifest) {
        let build: Build;
        for (const b of ev.detail.manifest.builds) {
          if (b.chipFamily === ev.detail.chipFamily) {
            build = b;
            break;
          }
        }
        if (build!.improv) {
          hasImprov = true;
          // @ts-ignore
          // preload improv
          import("https://www.improv-wifi.com/sdk-js/launch-button.js");
        }
      }
      progressEl?.processState(ev.detail);
      logEl?.processState(ev.detail);
    });
  }

  const showLog = button.showLog || button.hasAttribute("show-log");
  const showProgress =
    !showLog &&
    button.hideProgress !== true &&
    !button.hasAttribute("hide-progress");

  if (showLog && !logEl) {
    logEl = addElement<FlashLog>(
      button,
      document.createElement("esp-web-flash-log")
    );
  } else if (!showLog && logEl) {
    logEl.remove();
    logEl = undefined;
  }

  if (showProgress && !progressEl) {
    progressEl = addElement<FlashProgress>(
      button,
      document.createElement("esp-web-flash-progress")
    );
  } else if (!showProgress && progressEl) {
    progressEl.remove();
    progressEl = undefined;
  }

  logEl?.clear();
  progressEl?.clear();

  flash(
    button,
    console,
    manifest,
    button.eraseFirst !== undefined
      ? button.eraseFirst
      : button.hasAttribute("erase-first")
  );
};

const startImprov = async (button: InstallButton) => {
  // @ts-ignore
  await import("https://www.improv-wifi.com/sdk-js/launch-button.js");

  if (!customElements.get("improv-wifi-launch-button").isSupported) {
    return;
  }

  const improvLaunchButton = document.createElement(
    "improv-wifi-launch-button"
  );
  const improvButton = document.createElement("button");
  improvButton.slot = "activate";
  improvButton.textContent = "Click here to finish setting up your device.";
  improvLaunchButton.appendChild(improvButton);

  addElement(button, improvLaunchButton);
};

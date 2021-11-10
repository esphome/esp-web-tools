import type { InstallButton } from "./install-button.js";
import "./install-dialog.js";

export const connect = async (button: InstallButton) => {
  let port: SerialPort | undefined;
  try {
    port = await navigator.serial.requestPort();
  } catch (err) {
    console.error("User cancelled request", err);
    return;
  }

  if (!port) {
    return;
  }

  await port.open({ baudRate: 115200 });

  const el = document.createElement("ewt-install-dialog");
  el.port = port;
  el.manifestPath = button.manifest || button.getAttribute("manifest")!;
  el.addEventListener(
    "closed",
    () => {
      port!.close();
    },
    { once: true }
  );
  document.body.appendChild(el);
};

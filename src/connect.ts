import type { InstallButton } from "./install-button.js";
import { loadLocale, t } from "./localize.js";
import { requestSerialPort } from "./util/serial.js";

export const connect = async (button: InstallButton) => {
  import("./install-dialog.js");
  // The port chooser must be requested before awaiting translations.
  const translations = loadLocale();
  let port: SerialPort | undefined;
  try {
    port = await requestSerialPort();
  } catch (err: any) {
    if ((err as DOMException).name === "NotFoundError") {
      const [mod] = await Promise.all([
        import("./no-port-picked/index"),
        translations,
      ]);
      mod.openNoPortPickedDialog(() => connect(button));
      return;
    }
    await translations;
    alert(`${t("Error")}: ${err.message}`);
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

  await translations;

  const el = document.createElement("ewt-install-dialog");
  el.port = port;
  el.manifestPath = button.manifest || button.getAttribute("manifest")!;
  el.overrides = button.overrides;
  el.addEventListener(
    "closed",
    () => {
      port!.close();
    },
    { once: true },
  );
  document.body.appendChild(el);
};

import {
  Manifest,
  FlashState,
  FlashError,
  FlashStateType,
} from "./const.js";
import type { InstallButton } from "./install-button.js";
import "./install-dialog.js";

export const connect = async (
  onEvent: (state: FlashState) => void,
  button: InstallButton,
  ) => {
  let port: SerialPort | undefined;
  let manifest: Manifest;

  const fireStateEvent = (stateUpdate: FlashState) =>
  onEvent({
    ...stateUpdate,
    manifest
  });

  let serialPortFilter: SerialPortFilter[] | undefined
  let serialPortRequestOptions: SerialPortRequestOptions

  const el = document.createElement("ewt-install-dialog");
  el.manifestPath = button.manifest || button.getAttribute("manifest")!;

  const manifestURL = new URL(el.manifestPath, location.toString()).toString();
  const manifestProm = fetch(manifestURL).then(
    (resp): Promise<Manifest> => resp.json()
  );

  try {
    manifest = await manifestProm;
  } catch (err: any) {
    fireStateEvent({
      state: FlashStateType.ERROR,
      message: `Unable to fetch manifest: ${err}`,
      details: { error: FlashError.FAILED_MANIFEST_FETCH, details: err },
    });
    return;
  }

  serialPortFilter = manifest.serialPortFilter

  serialPortRequestOptions = {
    filters : serialPortFilter
  }

  try {
    if (serialPortFilter != undefined){
      port = await navigator.serial.requestPort(serialPortRequestOptions);
    }else{
      port = await navigator.serial.requestPort();
    }
  } catch (err: any) {
    if ((err as DOMException).name === "NotFoundError") {
      return;
    }
    alert(`Error: ${err.message}`);
    return;
  }

  if (!port) {
    return;
  }

  try {
    await port.open({ baudRate: 115200 });
  } catch (err: any) {
    alert(err.message);
    return;
  }

  el.port = port;
  el.addEventListener(
    "closed",
    () => {
      port!.close();
    },
    { once: true }
  );
  document.body.appendChild(el);
};

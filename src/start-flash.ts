import { Build, Manifest } from "./const";
import { connect } from "./vendor/esptool";
import { Logger } from "./vendor/esptool/const";
import { ESPLoader } from "./vendor/esptool/esp_loader";
import "./flash-log";
import { getChipFamilyName } from "./util";

export const startFlash = async (
  logger: Logger,
  manifestPath: string,
  logParent: HTMLElement
) => {
  const manifestURL = new URL(manifestPath, location.toString()).toString();
  const manifestProm = fetch(manifestURL).then(
    (resp): Promise<Manifest> => resp.json()
  );

  let bytesWritten = 0;
  let totalSize = 0;

  let esploader: ESPLoader | undefined;
  let manifest: Manifest | undefined;

  try {
    esploader = await connect(logger);
  } catch (err) {
    // User pressed cancel on web serial
    return;
  }

  const logEl = document.createElement("esphome-web-flash-log");
  logEl.esploader = esploader;
  logParent.append(logEl);

  try {
    await esploader.initialize();
  } catch (err) {
    console.error(err);
    if (esploader.connected) {
      logEl.errorMsg =
        "Failed to initialize. Try resetting your device or holding the BOOT button before clicking connect.";
      await esploader.disconnect();
    }
    return;
  }

  // To reflect initialized status
  logEl.requestUpdate();

  try {
    manifest = await manifestProm;
  } catch (err) {
    logEl.errorMsg = `Unable to fetch manifest: ${err}`;
    await esploader.disconnect();
    return;
  }

  logEl.manifest = manifest;

  const chipFamily = getChipFamilyName(esploader);

  let build: Build | undefined;
  for (const b of manifest.builds) {
    if (b.chipFamily === chipFamily) {
      build = b;
      break;
    }
  }

  if (!build) {
    logEl.errorMsg = `Your ${chipFamily} board is not supported.`;
    await esploader.disconnect();
    return;
  }

  logEl.offerImprov = build.improv;
  logEl.extraMsg = "Preparing installation...";

  // Pre-load improv for later
  if (build.improv) {
    // @ts-ignore
    import("https://www.improv-wifi.com/sdk-js/launch-button.js");
  }

  (window as any).esploader = esploader;

  const filePromises = build.parts.map(async (part) => {
    const url = new URL(part.filename, manifestURL).toString();
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(
        `Downlading firmware ${part.filename} failed: ${resp.status}`
      );
    }
    return resp.arrayBuffer();
  });

  // Run the stub while we wait for files to download
  const espStub = await esploader.runStub();

  const files: ArrayBuffer[] = [];

  for (const prom of filePromises) {
    try {
      const data = await prom;
      files.push(data);
      totalSize += data.byteLength;
    } catch (err) {
      logEl.errorMsg = err.message;
      await esploader.disconnect();
      return;
    }
  }

  logEl.totalBytes = totalSize;
  logEl.extraMsg = "";
  let lastPct = -1;

  for (const part of build.parts) {
    await espStub.flashData(
      files.shift()!,
      (newBytesWritten) => {
        const newPct = Math.floor((newBytesWritten / totalSize) * 100);
        if (newPct === lastPct) {
          return;
        }
        lastPct = newPct;
        bytesWritten = newBytesWritten;
        logEl.bytesWritten = bytesWritten;
      },
      part.offset
    );
  }

  await esploader.softReset();

  logEl.bytesWritten = totalSize;

  await esploader.disconnect();
};

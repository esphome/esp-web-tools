import { html } from "lit";
import { connect } from "esp-web-flasher";
import { Build, ESPLoader, Manifest, Logger } from "./const";
import "./flash-log";
import { getChipFamilyName, sleep } from "./util";

export const startFlash = async (
  logger: Logger,
  manifestPath: string,
  logParent: HTMLElement,
  eraseFirst: boolean
) => {
  const manifestURL = new URL(manifestPath, location.toString()).toString();
  const manifestProm = fetch(manifestURL).then(
    (resp): Promise<Manifest> => resp.json()
  );

  let esploader: ESPLoader | undefined;

  try {
    esploader = await connect(logger);
  } catch (err) {
    // User pressed cancel on web serial
    return;
  }

  // For debugging
  (window as any).esploader = esploader;

  const logEl = document.createElement("esphome-web-flash-log");
  // logEl.esploader = esploader;
  logEl.addRow({ id: "initializing", content: "Initializing..." });
  logParent.append(logEl);

  try {
    await esploader.initialize();
  } catch (err) {
    console.error(err);
    if (esploader.connected) {
      logEl.addError(
        "Failed to initialize. Try resetting your device or holding the BOOT button before clicking connect."
      );
      await esploader.disconnect();
    }
    return;
  }

  logEl.addRow({
    id: "initializing",
    content: html`Initialized. Found ${getChipFamilyName(esploader)}`,
  });
  logEl.addRow({ id: "manifest", content: "Fetching manifest..." });

  let manifest: Manifest | undefined;
  try {
    manifest = await manifestProm;
  } catch (err) {
    logEl.addError(`Unable to fetch manifest: ${err}`);
    await esploader.disconnect();
    return;
  }

  logEl.addRow({
    id: "manifest",
    content: html`Found manifest for ${manifest.name}`,
  });

  const chipFamily = getChipFamilyName(esploader);

  let build: Build | undefined;
  for (const b of manifest.builds) {
    if (b.chipFamily === chipFamily) {
      build = b;
      break;
    }
  }

  if (!build) {
    logEl.addError(`Your ${chipFamily} board is not supported.`);
    await esploader.disconnect();
    return;
  }

  logEl.addRow({
    id: "preparing",
    content: "Preparing installation...",
  });

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

  // Pre-load improv for later
  if (build.improv) {
    // @ts-ignore
    import("https://www.improv-wifi.com/sdk-js/launch-button.js");
  }

  // Run the stub while we wait for files to download
  const espStub = await esploader.runStub();

  const files: ArrayBuffer[] = [];
  let totalSize = 0;

  for (const prom of filePromises) {
    try {
      const data = await prom;
      files.push(data);
      totalSize += data.byteLength;
    } catch (err) {
      logEl.addError(err.message);
      await esploader.disconnect();
      return;
    }
  }

  logEl.addRow({
    id: "preparing",
    content: `Ready to install`,
  });

  if (eraseFirst) {
    logEl.addRow({
      id: "erase",
      content: html`Erasing device`,
    });
  }

  let lastPct = 0;

  logEl.addRow({
    id: "write",
    content: html`Writing progress: ${lastPct}%`,
  });

  for (const part of build.parts) {
    await espStub.flashData(
      files.shift()!,
      (newBytesWritten) => {
        const newPct = Math.floor((newBytesWritten / totalSize) * 100);
        if (newPct === lastPct) {
          return;
        }
        lastPct = newPct;
        logEl.addRow({
          id: "write",
          content: html`Writing progress: ${newPct}%`,
        });
      },
      part.offset
    );
  }

  await sleep(100);
  await esploader.softReset();

  const doImprov =
    build.improv &&
    customElements.get("improv-wifi-launch-button")?.isSupported;

  logEl.addRow({
    id: "write",
    content: html`Writing
    complete${doImprov
      ? ""
      : html`, all done!<br /><br /><button
            @click=${() => logParent.removeChild(logEl)}
          >
            Close this dialog
          </button>`}`,
  });

  await esploader.disconnect();

  if (!doImprov) {
    return;
  }

  // Todo: listen for improv events to know when to close dialog
  logEl.addRow({
    id: "improv",
    action: true,
    content: html`
      <improv-wifi-launch-button
        ><button slot="activate">
          Click here to finish setting up your device.
        </button></improv-wifi-launch-button
      >
    `,
  });
};

import { connect, ESPLoader, Logger } from "esp-web-flasher";
import { Build, Manifest, State } from "./const";
import { fireEvent, getChipFamilyName, sleep } from "./util";

export const startFlash = async (
  eventTarget: EventTarget,
  logger: Logger,
  manifestPath: string,
  eraseFirst: boolean,
  addElement: (el: HTMLElement) => void
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

  fireEvent(eventTarget, "state-changed", {
    state: State.INITIALIZING,
    message: "Initializing...",
    details: { done: false },
  });

  try {
    await esploader.initialize();
  } catch (err) {
    logger.error(err);
    if (esploader.connected) {
      fireEvent(eventTarget, "state-changed", {
        state: State.ERROR,
        message:
          "Failed to initialize. Try resetting your device or holding the BOOT button before clicking connect.",
        details: { error: "failed_initialize", deatils: err },
      });
      await esploader.disconnect();
    }
    return;
  }

  const chipFamily = getChipFamilyName(esploader);

  fireEvent(eventTarget, "state-changed", {
    state: State.INITIALIZING,
    message: `Initialized. Found ${chipFamily}`,
    details: { done: true, chipFamily },
  });
  fireEvent(eventTarget, "state-changed", {
    state: State.MANIFEST,
    message: "Fetching manifest...",
    details: { done: false },
  });

  let manifest: Manifest | undefined;
  try {
    manifest = await manifestProm;
  } catch (err) {
    fireEvent(eventTarget, "state-changed", {
      state: State.ERROR,
      message: `Unable to fetch manifest: ${err.message}`,
      details: { error: "fetch_manifest_failed", details: err },
    });
    await esploader.disconnect();
    return;
  }

  fireEvent(eventTarget, "state-changed", {
    state: State.MANIFEST,
    message: `Found manifest for ${manifest.name}`,
    details: { done: true, manifest },
  });

  let build: Build | undefined;
  for (const b of manifest.builds) {
    if (b.chipFamily === chipFamily) {
      build = b;
      break;
    }
  }

  if (!build) {
    fireEvent(eventTarget, "state-changed", {
      state: State.ERROR,
      message: `Your ${chipFamily} board is not supported.`,
      details: { error: "not_supported", details: { chipFamily } },
    });
    await esploader.disconnect();
    return;
  }

  fireEvent(eventTarget, "state-changed", {
    state: State.PREPARING,
    message: "Preparing installation...",
    details: { done: false },
  });

  const filePromises = build.parts.map(async (part) => {
    const url = new URL(part.path, manifestURL).toString();
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(
        `Downlading firmware ${part.path} failed: ${resp.status}`
      );
    }
    return resp.arrayBuffer();
  });

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
      fireEvent(eventTarget, "state-changed", {
        state: State.ERROR,
        message: err,
        details: { error: "failed_firmware_download", details: err },
      });
      await esploader.disconnect();
      return;
    }
  }

  fireEvent(eventTarget, "state-changed", {
    state: State.PREPARING,
    message: "Installation prepared",
    details: { done: true },
  });

  // Pre-load improv for later
  if (build.improv) {
    // @ts-ignore
    import("https://www.improv-wifi.com/sdk-js/launch-button.js");
  }

  if (eraseFirst) {
    fireEvent(eventTarget, "state-changed", {
      state: State.ERASING,
      message: "Erasing device...",
      details: { done: false },
    });
    await espStub.eraseFlash();
    fireEvent(eventTarget, "state-changed", {
      state: State.ERASING,
      message: "Device erased",
      details: { done: true },
    });
  }

  let lastPct = 0;

  fireEvent(eventTarget, "state-changed", {
    state: State.WRITING,
    message: `Writing progress: ${lastPct}%`,
    details: {
      bytesTotal: totalSize,
      bytesWritten: 0,
      percentage: lastPct,
    },
  });

  let totalWritten = 0;

  for (const part of build.parts) {
    const file = files.shift()!;
    try {
      await espStub.flashData(
        file,
        (bytesWritten) => {
          const newPct = Math.floor(
            ((totalWritten + bytesWritten) / totalSize) * 100
          );
          if (newPct === lastPct) {
            return;
          }
          lastPct = newPct;
          fireEvent(eventTarget, "state-changed", {
            state: State.WRITING,
            message: `Writing progress: ${newPct}%`,
            details: {
              bytesTotal: totalSize,
              bytesWritten: totalWritten + bytesWritten,
              percentage: newPct,
            },
          });
        },
        part.offset
      );
    } catch (err) {
      fireEvent(eventTarget, "state-changed", {
        state: State.ERROR,
        message: err,
        details: { error: "write_failed", details: err },
      });
      await esploader.disconnect();
      return;
    }
    totalWritten += file.byteLength;
  }

  fireEvent(eventTarget, "state-changed", {
    state: State.WRITING,
    message: "Writing complete",
    details: {
      bytesTotal: totalSize,
      bytesWritten: totalWritten,
      percentage: 100,
    },
  });

  await sleep(100);
  await esploader.softReset();
  await esploader.disconnect();

  if (build.improv) {
    // @ts-ignore
    await import("https://www.improv-wifi.com/sdk-js/launch-button.js");
  }

  const doImprov =
    build.improv && customElements.get("improv-wifi-launch-button").isSupported;

  if (!doImprov) {
    fireEvent(eventTarget, "state-changed", {
      state: State.FINISHED,
      message: "All done!",
    });
    return;
  }

  fireEvent(eventTarget, "state-changed", {
    state: State.IMPROV,
    message: "Flashing done, click the setup button to continue",
  });

  const improvLaunchButton = document.createElement(
    "improv-wifi-launch-button"
  );
  const button = document.createElement("button");
  button.slot = "activate";
  button.textContent = "Click here to finish setting up your device.";
  improvLaunchButton.appendChild(button);

  addElement(improvLaunchButton);

  // Todo: listen for improv events to know when to close dialog
  fireEvent(eventTarget, "state-changed", {
    state: State.FINISHED,
    message: "All done!",
  });
};

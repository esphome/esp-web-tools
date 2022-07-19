// @ts-ignore-next-line
import { Transport } from "esptool-js/webserial.js";
// @ts-ignore-next-line
import { ESPLoader } from "esptool-js/esploader.js";
import {
  Build,
  ChipFamily,
  FlashError,
  FlashState,
  Manifest,
  FlashStateType,
} from "./const";
import { sleep } from "./util/sleep";

const resetTransport = async (transport: Transport) => {
  await transport.device.setSignals({
    dataTerminalReady: false,
    requestToSend: true,
  });
  await transport.device.setSignals({
    dataTerminalReady: false,
    requestToSend: false,
  });
};

export const flash = async (
  onEvent: (state: FlashState) => void,
  port: SerialPort,
  manifestPath: string,
  eraseFirst: boolean
) => {
  const logger = console;
  let manifest: Manifest;
  let build: Build | undefined;
  let chipFamily: ChipFamily;

  const fireStateEvent = (stateUpdate: FlashState) =>
    onEvent({
      ...stateUpdate,
      manifest,
      build,
      chipFamily,
    });

  const manifestURL = new URL(manifestPath, location.toString()).toString();
  const manifestProm = fetch(manifestURL).then(
    (resp): Promise<Manifest> => resp.json()
  );

  const transport = new Transport(port);
  const esploader = new ESPLoader(transport, 115200);

  // For debugging
  (window as any).esploader = esploader;

  fireStateEvent({
    state: FlashStateType.INITIALIZING,
    message: "Initializing...",
    details: { done: false },
  });

  try {
    await esploader.main_fn();
    await esploader.flash_id();
  } catch (err: any) {
    logger.error(err);
    fireStateEvent({
      state: FlashStateType.ERROR,
      message:
        "Failed to initialize. Try resetting your device or holding the BOOT button while clicking INSTALL.",
      details: { error: FlashError.FAILED_INITIALIZING, details: err },
    });
    await transport.disconnect();
    return;
  }

  chipFamily = await esploader.chip.CHIP_NAME;

  if (!esploader.chip.ROM_TEXT) {
    fireStateEvent({
      state: FlashStateType.ERROR,
      message: `Chip ${chipFamily} is not supported`,
      details: {
        error: FlashError.NOT_SUPPORTED,
        details: `Chip ${chipFamily} is not supported`,
      },
    });
    await transport.disconnect();
    return;
  }

  fireStateEvent({
    state: FlashStateType.INITIALIZING,
    message: `Initialized. Found ${chipFamily}`,
    details: { done: true },
  });
  fireStateEvent({
    state: FlashStateType.MANIFEST,
    message: "Fetching manifest...",
    details: { done: false },
  });

  try {
    manifest = await manifestProm;
  } catch (err: any) {
    fireStateEvent({
      state: FlashStateType.ERROR,
      message: `Unable to fetch manifest: ${err}`,
      details: { error: FlashError.FAILED_MANIFEST_FETCH, details: err },
    });
    await transport.disconnect();
    return;
  }

  build = manifest.builds.find((b) => b.chipFamily === chipFamily);

  fireStateEvent({
    state: FlashStateType.MANIFEST,
    message: `Found manifest for ${manifest.name}`,
    details: { done: true },
  });

  if (!build) {
    fireStateEvent({
      state: FlashStateType.ERROR,
      message: `Your ${chipFamily} board is not supported.`,
      details: { error: FlashError.NOT_SUPPORTED, details: chipFamily },
    });
    await transport.disconnect();
    return;
  }

  fireStateEvent({
    state: FlashStateType.PREPARING,
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

    const reader = new FileReader();
    const blob = await resp.blob();

    return new Promise<string>((resolve) => {
      reader.addEventListener("load", () => resolve(reader.result as string));
      reader.readAsBinaryString(blob);
    });
  });

  const fileArray: Array<{ data: string; address: number }> = [];
  let totalSize = 0;

  for (let part = 0; part < filePromises.length; part++) {
    try {
      const data = await filePromises[part];
      fileArray.push({ data, address: build.parts[part].offset });
      totalSize += data.length;
    } catch (err: any) {
      fireStateEvent({
        state: FlashStateType.ERROR,
        message: err.message,
        details: {
          error: FlashError.FAILED_FIRMWARE_DOWNLOAD,
          details: err.message,
        },
      });
      await transport.disconnect();
      return;
    }
  }

  fireStateEvent({
    state: FlashStateType.PREPARING,
    message: "Installation prepared",
    details: { done: true },
  });

  if (eraseFirst) {
    fireStateEvent({
      state: FlashStateType.ERASING,
      message: "Erasing device...",
      details: { done: false },
    });
    await esploader.erase_flash();
    fireStateEvent({
      state: FlashStateType.ERASING,
      message: "Device erased",
      details: { done: true },
    });
  }

  fireStateEvent({
    state: FlashStateType.WRITING,
    message: `Writing progress: 0%`,
    details: {
      bytesTotal: totalSize,
      bytesWritten: 0,
      percentage: 0,
    },
  });

  let totalWritten = 0;

  try {
    await esploader.write_flash({
      fileArray,
      reportProgress(fileIndex: number, written: number, total: number) {
        const uncompressedWritten =
          (written / total) * fileArray[fileIndex].data.length;

        const newPct = Math.floor(
          ((totalWritten + uncompressedWritten) / totalSize) * 100
        );

        // we're done with this file
        if (written === total) {
          totalWritten += uncompressedWritten;
          return;
        }

        fireStateEvent({
          state: FlashStateType.WRITING,
          message: `Writing progress: ${newPct}%`,
          details: {
            bytesTotal: totalSize,
            bytesWritten: totalWritten + written,
            percentage: newPct,
          },
        });
      },
    });
  } catch (err: any) {
    fireStateEvent({
      state: FlashStateType.ERROR,
      message: err.message,
      details: { error: FlashError.WRITE_FAILED, details: err },
    });
    await transport.disconnect();
    return;
  }

  fireStateEvent({
    state: FlashStateType.WRITING,
    message: "Writing complete",
    details: {
      bytesTotal: totalSize,
      bytesWritten: totalWritten,
      percentage: 100,
    },
  });

  await sleep(100);
  console.log("HARD RESET");
  await resetTransport(transport);
  console.log("DISCONNECT");
  await transport.disconnect();

  fireStateEvent({
    state: FlashStateType.FINISHED,
    message: "All done!",
  });
};

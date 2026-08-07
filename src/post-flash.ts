import type { Logger } from "./const.js";

export type PostFlashCallback = (port: SerialPort) => void | Promise<void>;

export const runPostFlash = async (
  port: SerialPort,
  callback: PostFlashCallback | undefined,
  initialize: () => void | Promise<void>,
  logger: Logger,
) => {
  // Flashing closes the port. Reopen it before the callback reads boot output.
  await port.open({ baudRate: 115200, bufferSize: 8192 });
  try {
    await callback?.(port);
  } catch (error) {
    logger.error("Post-flash callback failed.", error);
  }
  await initialize();
};

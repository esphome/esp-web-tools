export interface Logger {
  log(msg: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
}

export interface Build {
  chipFamily: "ESP32" | "ESP8266" | "ESP32-S2" | "ESP32-C3";
  parts: {
    path: string;
    offset: number;
  }[];
}

export interface Manifest {
  name: string;
  version: string;
  home_assistant_domain?: string;
  new_install_skip_erase?: boolean;
  builds: Build[];
}

export interface BaseFlashState {
  state: FlashStateType;
  message: string;
  manifest?: Manifest;
  build?: Build;
  chipFamily?: Build["chipFamily"] | "Unknown Chip";
}

export interface InitializingState extends BaseFlashState {
  state: FlashStateType.INITIALIZING;
  details: { done: boolean };
}

export interface ManifestState extends BaseFlashState {
  state: FlashStateType.MANIFEST;
  details: { done: boolean };
}

export interface PreparingState extends BaseFlashState {
  state: FlashStateType.PREPARING;
  details: { done: boolean };
}

export interface ErasingState extends BaseFlashState {
  state: FlashStateType.ERASING;
  details: { done: boolean };
}

export interface WritingState extends BaseFlashState {
  state: FlashStateType.WRITING;
  details: { bytesTotal: number; bytesWritten: number; percentage: number };
}

export interface FinishedState extends BaseFlashState {
  state: FlashStateType.FINISHED;
}

export interface ErrorState extends BaseFlashState {
  state: FlashStateType.ERROR;
  details: { error: FlashError; details: string | Error };
}

export type FlashState =
  | InitializingState
  | ManifestState
  | PreparingState
  | ErasingState
  | WritingState
  | FinishedState
  | ErrorState;

export const enum FlashStateType {
  INITIALIZING = "initializing",
  MANIFEST = "manifest",
  PREPARING = "preparing",
  ERASING = "erasing",
  WRITING = "writing",
  FINISHED = "finished",
  ERROR = "error",
}

export const enum FlashError {
  FAILED_INITIALIZING = "failed_initialize",
  FAILED_MANIFEST_FETCH = "fetch_manifest_failed",
  NOT_SUPPORTED = "not_supported",
  FAILED_FIRMWARE_DOWNLOAD = "failed_firmware_download",
  WRITE_FAILED = "write_failed",
}

declare global {
  interface HTMLElementEventMap {
    "state-changed": CustomEvent<FlashState>;
  }
}

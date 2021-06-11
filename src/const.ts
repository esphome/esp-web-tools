export interface Build {
  chipFamily: "ESP32" | "ESP8266";
  improv: boolean;
  parts: {
    path: string;
    offset: number;
  }[];
}

export interface Manifest {
  name: string;
  builds: Build[];
}

export interface BaseFlashState {
  state: State;
  message: string;
}

export interface InitializingState extends BaseFlashState {
  state: State.INITIALIZING;
  details: { done: boolean; chipFamily?: string };
}
export interface ManifestState extends BaseFlashState {
  state: State.MANIFEST;
  details: { done: boolean; manifest?: Manifest };
}
export interface PreparingState extends BaseFlashState {
  state: State.PREPARING;
  details: { done: boolean };
}
export interface ErasingState extends BaseFlashState {
  state: State.ERASING;
  details: { done: boolean };
}
export interface WritingState extends BaseFlashState {
  state: State.WRITING;
  details: { bytesTotal: number; bytesWritten: number; percentage: number };
}
export interface ImprovState extends BaseFlashState {
  state: State.IMPROV;
}
export interface FinishedState extends BaseFlashState {
  state: State.FINISHED;
}
export interface ErrorState extends BaseFlashState {
  state: State.ERROR;
  details: { error: FlashError; details: string | Error };
}

export type FlashState =
  | InitializingState
  | ManifestState
  | PreparingState
  | ErasingState
  | WritingState
  | ImprovState
  | FinishedState
  | ErrorState;

export const enum State {
  INITIALIZING = "initializing",
  MANIFEST = "manifest",
  PREPARING = "preparing",
  ERASING = "erasing",
  WRITING = "writing",
  IMPROV = "improv",
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

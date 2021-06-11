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

export interface FlashState {
  state: State;
  message: string;
  details?: any;
}

export enum State {
  INITIALIZING = "initializing",
  MANIFEST = "manifest",
  PREPARING = "preparing",
  ERASING = "erasing",
  WRITING = "writing",
  IMPROV = "improv",
  FINISHED = "finished",
  ERROR = "error",
}

declare global {
  interface HTMLElementEventMap {
    "state-changed": CustomEvent<FlashState>;
  }
}

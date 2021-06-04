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

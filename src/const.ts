import { connect } from "esp-web-flasher";

type AsyncReturnType<T extends (...args: any) => any> = T extends (
  ...args: any
) => Promise<infer U>
  ? U
  : T extends (...args: any) => infer U
  ? U
  : any;

// Waiting for esp-web-flash >1.0.0 release which will include this type
export type ESPLoader = AsyncReturnType<typeof connect>;
export type Logger = Parameters<typeof connect>[0];

export interface Build {
  chipFamily: "ESP32" | "ESP8266";
  improv: boolean;
  parts: {
    filename: string;
    offset: number;
  }[];
}

export interface Manifest {
  name: string;
  builds: Build[];
}

import { Build } from "../const";
import { ESPLoader } from "esptool-js";

export interface DetectedHardware {
  chipFamily: Build["chipFamily"];
  flashSizeMB?: number;
  psramSizeMB?: number;
}

/**
 * Parse PSRAM size in MB from chip features array.
 * Returns undefined if no size can be determined.
 */
export const parsePsramSizeFromFeatures = (
  features: string[],
): number | undefined => {
  for (const feature of features) {
    const match = feature.match(/Embedded PSRAM (\d+)MB/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
};

/**
 * Query flash size and chip features from the device.
 */
export const detectHardware = async (
  esploader: ESPLoader,
  chipFamily: Build["chipFamily"],
): Promise<DetectedHardware> => {
  const [flashKB, features] = await Promise.all([
    esploader.getFlashSize(),
    esploader.chip.getChipFeatures(esploader),
  ]);

  return {
    chipFamily,
    flashSizeMB: flashKB / 1024,
    psramSizeMB: parsePsramSizeFromFeatures(features),
  };
};

/**
 * Find the best matching build using most-specific-match-wins algorithm.
 *
 * - A build whose qualifier does NOT match the device is excluded
 * - Among remaining builds, the one with the most matching qualifiers wins
 * - Ties broken by manifest order (first wins)
 * - A build with no qualifiers (score 0) is the fallback
 */
export const findBestBuild = (
  builds: Build[],
  hw: DetectedHardware,
): Build | undefined => {
  let bestBuild: Build | undefined;
  let bestScore = -1;

  for (const b of builds) {
    if (b.chipFamily !== hw.chipFamily) continue;

    let score = 0;
    let excluded = false;

    if (b.flashSizeMB != null) {
      if (hw.flashSizeMB != null && b.flashSizeMB === hw.flashSizeMB) {
        score++;
      } else {
        excluded = true;
      }
    }

    if (b.psramSizeMB != null) {
      if (hw.psramSizeMB != null && b.psramSizeMB === hw.psramSizeMB) {
        score++;
      } else {
        excluded = true;
      }
    }

    if (!excluded && score > bestScore) {
      bestScore = score;
      bestBuild = b;
    }
  }

  return bestBuild;
};

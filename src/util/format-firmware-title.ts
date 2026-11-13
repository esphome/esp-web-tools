// Words with a fixed, non-standard capitalisation. Keys are lowercase; add
// more entries here as needed.
const SPECIAL_WORDS = new Map<string, string>(
  Object.entries({
    esphome: "ESPHome",
  }),
);

const titleCaseWord = (word: string): string =>
  SPECIAL_WORDS.get(word.toLowerCase()) ??
  word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Turn a manifest name like `esphome.bluetooth_proxy` into a multi-line,
 * title cased dialog heading ("ESPHome\nBluetooth Proxy").
 *
 * - Each `.` starts a new line.
 * - Only hyphens or only underscores: both become spaces.
 * - A mix of both: underscores become spaces, hyphens are kept.
 * - Every word (split on spaces and hyphens) is title cased.
 */
export const formatFirmwareTitle = (name: string): string => {
  const hasHyphen = name.includes("-");
  const hasUnderscore = name.includes("_");
  let normalized = name.replace(/_/g, " ");
  if (hasHyphen && !hasUnderscore) {
    normalized = normalized.replace(/-/g, " ");
  }
  return normalized
    .split(".")
    .map((line) =>
      line
        .split(/([ -])/)
        .map((part) => titleCaseWord(part))
        .join("")
        .trim(),
    )
    .filter((line) => line !== "")
    .join("\n");
};

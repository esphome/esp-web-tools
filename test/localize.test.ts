import { afterEach, describe, expect, it } from "vitest";
import { loadLocale, t } from "../src/localize";

const originalLanguage = document.documentElement.lang;

afterEach(() => {
  document.documentElement.lang = originalLanguage;
});

describe("Swedish localization", () => {
  it("uses Swedish when the document language is Swedish", async () => {
    document.documentElement.lang = "sv-SE";
    await loadLocale();

    expect(t("Connect")).toBe("Anslut");
    expect(t("Connected to {name}", { name: "ESPHome" })).toBe(
      "Ansluten till ESPHome",
    );
    expect(t("Writing progress: {percentage}%", { percentage: 50 })).toBe(
      "Skriver: 50 %",
    );
  });

  it("keeps the source text for other languages", async () => {
    document.documentElement.lang = "en";
    await loadLocale();

    expect(t("Connect")).toBe("Connect");
    expect(t("Connected to {name}", { name: "ESPHome" })).toBe(
      "Connected to ESPHome",
    );
  });
});

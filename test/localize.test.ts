import { afterEach, describe, expect, it } from "vitest";
import { t } from "../src/localize";

const originalLanguage = document.documentElement.lang;

afterEach(() => {
  document.documentElement.lang = originalLanguage;
});

describe("Swedish localization", () => {
  it("uses Swedish when the document language is Swedish", () => {
    document.documentElement.lang = "sv-SE";

    expect(t("Connect")).toBe("Anslut");
    expect(t("Install {name}", { name: "ESPHome" })).toBe("Installera ESPHome");
    expect(t("Writing progress: {percentage}%", { percentage: 50 })).toBe(
      "Skriver: 50 %",
    );
  });

  it("keeps the source text for other languages", () => {
    document.documentElement.lang = "en";

    expect(t("Connect")).toBe("Connect");
    expect(t("Install {name}", { name: "ESPHome" })).toBe("Install ESPHome");
  });
});

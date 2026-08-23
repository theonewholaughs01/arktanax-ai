import { describe, expect, it } from "vitest";
import { choosePreferredVoice } from "./voice";

describe("ARKTANAX browser voice preference", () => {
  it("prioritizes a known elegant feminine English voice when Chrome exposes one", () => {
    const voices = [
      { name: "Google Deutsch", lang: "de-DE", voiceURI: "de" },
      { name: "Google US English", lang: "en-US", voiceURI: "en-default" },
      { name: "Microsoft Aria Online", lang: "en-US", voiceURI: "aria" },
    ];

    expect(choosePreferredVoice(voices)?.voiceURI).toBe("aria");
  });

  it("falls back to the first English voice and then to the first device voice", () => {
    expect(choosePreferredVoice([
      { name: "Google Français", lang: "fr-FR", voiceURI: "fr" },
      { name: "Google UK English", lang: "en-GB", voiceURI: "en" },
    ])?.voiceURI).toBe("en");

    expect(choosePreferredVoice([
      { name: "Google Français", lang: "fr-FR", voiceURI: "fr" },
    ])?.voiceURI).toBe("fr");
  });
});

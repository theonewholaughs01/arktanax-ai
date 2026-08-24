import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");

describe("ARKTANAX text-only replies", () => {
  it("does not retain browser speech-synthesis or reply-playback paths", () => {
    expect(homeSource).not.toContain("speechSynthesis");
    expect(homeSource).not.toContain("SpeechSynthesisUtterance");
    expect(homeSource).not.toContain("speakReply");
    expect(homeSource).not.toContain("Preview voice");
  });

  it("keeps user microphone transcription available for the text composer", () => {
    expect(homeSource).toContain("trpc.voice.transcribe");
    expect(homeSource).toContain("onPointerDown={() => void startRecording()}");
    expect(homeSource).toContain("setComposer(transcript.text)");
  });
});

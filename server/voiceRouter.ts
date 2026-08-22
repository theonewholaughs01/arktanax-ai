import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { storageGetSignedUrl, storagePut } from "./storage";
import { protectedProcedure, router } from "./_core/trpc";
import { transcribeAudio } from "./_core/voiceTranscription";

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const supportedAudioTypes = new Set(["audio/webm", "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4", "audio/m4a"]);

function parseAudioData(audioData: string) {
  const match = audioData.match(/^data:([^;,]+)(?:;[^,]+)?;base64,([\s\S]+)$/);
  if (!match) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The microphone recording was not valid audio data." });
  }

  const mimeType = match[1].toLowerCase();
  if (!supportedAudioTypes.has(mimeType)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This audio format is not supported for transcription." });
  }

  const audio = Buffer.from(match[2], "base64");
  if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Voice recordings must be between 1 byte and 16 MB." });
  }

  const extensionByType: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
  };

  return { audio, mimeType, extension: extensionByType[mimeType] };
}

export const voiceRouter = router({
  transcribe: protectedProcedure
    .input(
      z.object({
        audioData: z.string().min(1).max(23_000_000),
        language: z.string().trim().min(2).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { audio, mimeType, extension } = parseAudioData(input.audioData);
      const stored = await storagePut(
        `voice/${ctx.user.id}/arktanax-${crypto.randomUUID()}.${extension}`,
        audio,
        mimeType,
      );
      const audioUrl = await storageGetSignedUrl(stored.key);
      const result = await transcribeAudio({
        audioUrl,
        language: input.language || "en",
        prompt: "Transcribe the user's spoken ARKTANAX request accurately and preserve punctuation when clear.",
      });

      if ("error" in result) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error, cause: result });
      }

      const text = result.text.trim();
      if (!text) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ARKTANAX did not detect a spoken request." });
      }

      return { text, language: result.language };
    }),
});

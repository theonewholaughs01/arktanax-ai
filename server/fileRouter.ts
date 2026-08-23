import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAssistantFile, getAssistantFile, listAssistantFiles } from "./db";
import { invokeLLM } from "./_core/llm";
import { storageGetSignedUrl, storagePut } from "./storage";
import { extractLLMReply } from "./assistant";
import { protectedProcedure, router } from "./_core/trpc";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_CHARS = 80_000;
const sourceTypes = new Set([
  "text/plain", "text/markdown", "application/json", "text/javascript", "application/javascript",
  "application/typescript", "text/typescript", "text/x-python", "text/css", "text/html", "application/sql",
]);
const sourceExtensions = new Set(["txt", "md", "json", "js", "jsx", "ts", "tsx", "py", "css", "html", "htm", "sql", "yml", "yaml", "sh", "bash"]);

function parseFileData(fileData: string, providedName: string, providedMimeType: string) {
  const match = fileData.match(/^data:([^;,]+)(?:;[^,]+)?;base64,([\s\S]+)$/);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected file was not valid upload data." });

  const safeName = providedName.replace(/[\\/\0]/g, "_").trim().slice(0, 255) || "uploaded-file";
  const extension = safeName.split(".").pop()?.toLowerCase() || "";
  const mimeType = (providedMimeType || match[1]).toLowerCase();
  const isSource = sourceTypes.has(mimeType) || sourceExtensions.has(extension);
  const isPdf = mimeType === "application/pdf" || extension === "pdf";
  if (!isSource && !isPdf) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ARKTANAX currently accepts source/text files and PDFs. Images, archives, and executables are not accepted in the no-cost workspace." });
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Files must be between 1 byte and 8 MB in the no-cost workspace." });
  }

  return { bytes, safeName, mimeType: isPdf ? "application/pdf" : mimeType || "text/plain", kind: isSource ? "source" as const : "document" as const };
}

export const fileRouter = router({
  list: protectedProcedure.query(({ ctx }) => listAssistantFiles(ctx.user.id)),

  upload: protectedProcedure.input(z.object({
    fileData: z.string().min(1).max(11_500_000),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().max(160).optional(),
    threadId: z.number().int().positive().optional(),
  })).mutation(async ({ ctx, input }) => {
    const parsed = parseFileData(input.fileData, input.fileName, input.mimeType || "");
    const stored = await storagePut(`arktanax/${ctx.user.id}/files/${crypto.randomUUID()}-${parsed.safeName}`, parsed.bytes, parsed.mimeType);
    const extractedText = parsed.kind === "source" ? parsed.bytes.toString("utf8").slice(0, MAX_SOURCE_CHARS) : null;
    return createAssistantFile(ctx.user.id, {
      threadId: input.threadId,
      fileName: parsed.safeName,
      storageKey: stored.key,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.bytes.length,
      kind: parsed.kind,
      extractedText,
    });
  }),

  analyze: protectedProcedure.input(z.object({
    fileId: z.number().int().positive(),
    prompt: z.string().trim().min(1).max(3_000),
  })).mutation(async ({ ctx, input }) => {
    const file = await getAssistantFile(ctx.user.id, input.fileId);
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found." });

    const sourceContext = file.kind === "source"
      ? `\n\nSOURCE FILE: ${file.fileName}\n\n${file.extractedText || "No readable source text was extracted."}`
      : "";
    const fileContext = file.kind === "document"
      ? [{ type: "file_url" as const, file_url: { url: await storageGetSignedUrl(file.storageKey), mime_type: "application/pdf" as const } }]
      : [];
    const response = await invokeLLM({
      model: "gemini-3-flash-preview",
      maxTokens: 1_500,
      messages: [
        { role: "system", content: "You are ARKTANAX in Code/File mode. Analyze the user-owned uploaded file precisely. You may summarize, answer questions, review code, find issues, or propose edits. Do not claim to execute code, inspect files beyond the supplied material, or make external changes." },
        { role: "user", content: [{ type: "text" as const, text: `${input.prompt}${sourceContext}` }, ...fileContext] },
      ],
    });
    const analysis = extractLLMReply(response.choices[0]?.message.content ?? "");
    if (!analysis) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ARKTANAX could not analyze that file." });
    return { fileId: file.id, analysis };
  }),
});

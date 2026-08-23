import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appendConversationMessage,
  createConversationThread,
  deleteConversationThread,
  getAssistantFile,
  getAssistantProfile,
  getConversationThread,
  getThreadMessages,
  listConversationThreads,
  renameConversationThread,
  updateConversationMode,
  upsertAssistantProfile,
} from "./db";
import { buildAssistantMessages, deriveThreadTitle, extractLLMReply, maxTokensForMode, type OperatingMode } from "./assistant";
import { invokeLLM } from "./_core/llm";
import { storageGetSignedUrl } from "./storage";
import { protectedProcedure, router } from "./_core/trpc";

const threadIdInput = z.object({ threadId: z.number().int().positive() });
const modeInput = z.enum(["fast", "deep", "code"]);

export const assistantRouter = router({
  listThreads: protectedProcedure.query(({ ctx }) =>
    listConversationThreads(ctx.user.id),
  ),

  createThread: protectedProcedure
    .input(z.object({ title: z.string().trim().min(1).max(160).optional(), mode: modeInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getAssistantProfile(ctx.user.id);
      const mode = input.mode || profile?.preferredMode || "fast";
      const thread = await createConversationThread(ctx.user.id, input.title || "New conversation", mode);
      if (profile?.preferredMode !== mode) await upsertAssistantProfile(ctx.user.id, { preferredMode: mode });
      return thread;
    }),

  getThread: protectedProcedure.input(threadIdInput).query(async ({ ctx, input }) => {
    const thread = await getConversationThread(ctx.user.id, input.threadId);
    if (!thread) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
    }

    const messages = await getThreadMessages(ctx.user.id, thread.id, 100);
    return { thread, messages };
  }),

  deleteThread: protectedProcedure.input(threadIdInput).mutation(async ({ ctx, input }) => {
    const deleted = await deleteConversationThread(ctx.user.id, input.threadId);
    if (!deleted) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
    }
    return { success: true } as const;
  }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        threadId: z.number().int().positive().optional(),
        content: z.string().trim().min(1).max(6_000),
        mode: modeInput.optional(),
        fileId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const content = input.content.trim();
      const profile = await getAssistantProfile(ctx.user.id);
      let thread = input.threadId
        ? await getConversationThread(ctx.user.id, input.threadId)
        : await createConversationThread(ctx.user.id, deriveThreadTitle(content), input.mode || profile?.preferredMode || "fast");

      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }

      if (thread.title === "New conversation") {
        thread = await renameConversationThread(ctx.user.id, thread.id, deriveThreadTitle(content));
      }

      const mode: OperatingMode = input.mode || thread.mode || profile?.preferredMode || "fast";
      if (thread.mode !== mode) thread = await updateConversationMode(ctx.user.id, thread.id, mode);
      if (profile?.preferredMode !== mode) await upsertAssistantProfile(ctx.user.id, { preferredMode: mode });

      await appendConversationMessage(ctx.user.id, thread.id, "user", content);
      const conversation = await getThreadMessages(ctx.user.id, thread.id, mode === "fast" ? 8 : 24);
      const attachedFile = input.fileId ? await getAssistantFile(ctx.user.id, input.fileId) : undefined;
      if (input.fileId && !attachedFile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "The selected file was not found in your workspace." });
      }

      try {
        const messages = buildAssistantMessages(
          conversation.map(message => ({ role: message.role, content: message.content })),
          mode,
          profile,
        );
        if (attachedFile?.kind === "source") {
          messages.push({
            role: "user",
            content: `Attached source file: ${attachedFile.fileName}\n\n${attachedFile.extractedText || "No readable source text was extracted."}`,
          });
        } else if (attachedFile) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: `Attached PDF: ${attachedFile.fileName}. Analyze it only in relation to the user’s current request.` },
              { type: "file_url", file_url: { url: await storageGetSignedUrl(attachedFile.storageKey), mime_type: "application/pdf" } },
            ],
          });
        }

        const response = await invokeLLM({
          model: "gemini-3-flash-preview",
          maxTokens: maxTokensForMode(mode),
          messages,
        });
        const reply = extractLLMReply(response.choices[0]?.message.content ?? "");

        if (!reply) {
          throw new Error("The assistant returned an empty reply.");
        }

        await appendConversationMessage(ctx.user.id, thread.id, "assistant", reply);
        return { threadId: thread.id, title: thread.title, reply };
      } catch (error) {
        console.error("[ARKTANAX] Assistant response failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "ARKTANAX could not generate a reply. Please try again.",
        });
      }
    }),
});

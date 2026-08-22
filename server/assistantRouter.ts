import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appendConversationMessage,
  createConversationThread,
  deleteConversationThread,
  getConversationThread,
  getThreadMessages,
  listConversationThreads,
  renameConversationThread,
} from "./db";
import { buildAssistantMessages, deriveThreadTitle, extractLLMReply } from "./assistant";
import { invokeLLM } from "./_core/llm";
import { protectedProcedure, router } from "./_core/trpc";

const threadIdInput = z.object({ threadId: z.number().int().positive() });

export const assistantRouter = router({
  listThreads: protectedProcedure.query(({ ctx }) =>
    listConversationThreads(ctx.user.id),
  ),

  createThread: protectedProcedure
    .input(z.object({ title: z.string().trim().min(1).max(160).optional() }))
    .mutation(({ ctx, input }) =>
      createConversationThread(ctx.user.id, input.title || "New conversation"),
    ),

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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const content = input.content.trim();
      let thread = input.threadId
        ? await getConversationThread(ctx.user.id, input.threadId)
        : await createConversationThread(ctx.user.id, deriveThreadTitle(content));

      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }

      if (thread.title === "New conversation") {
        thread = await renameConversationThread(ctx.user.id, thread.id, deriveThreadTitle(content));
      }

      await appendConversationMessage(ctx.user.id, thread.id, "user", content);
      const conversation = await getThreadMessages(ctx.user.id, thread.id, 24);

      try {
        const response = await invokeLLM({
          model: "gemini-3-flash-preview",
          maxTokens: 1_200,
          messages: buildAssistantMessages(
            conversation.map(message => ({ role: message.role, content: message.content })),
          ),
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

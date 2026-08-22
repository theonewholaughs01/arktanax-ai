import type { InvokeResult, Message } from "./_core/llm";

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export const ARKTANAX_SYSTEM_PROMPT = `You are ARKTANAX, a focused and intelligent personal AI assistant. Be direct, composed, useful, and concise by default. Maintain continuity from the active conversation and ask a clarifying question whenever a request is genuinely ambiguous. Use Markdown only where it aids clarity.

You currently have no connected external-device, account, browsing, or automation integrations. Never claim to have performed actions outside this conversation. If someone asks you to control a device, send a message, access an account, or execute an automation, say clearly that no integration is connected yet and offer useful instructions, planning, or a draft instead.`;

export function buildAssistantMessages(history: ConversationTurn[]): Message[] {
  return [
    { role: "system", content: ARKTANAX_SYSTEM_PROMPT },
    ...history
      .filter(turn => turn.content.trim().length > 0)
      .map(turn => ({ role: turn.role, content: turn.content.trim() })),
  ];
}

export function deriveThreadTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "New conversation";
  return normalized.length > 64 ? `${normalized.slice(0, 63).trimEnd()}…` : normalized;
}

export function extractLLMReply(
  content: InvokeResult["choices"][number]["message"]["content"],
): string {
  if (typeof content === "string") return content.trim();

  return content
    .filter(part => part.type === "text")
    .map(part => part.text)
    .join("\n")
    .trim();
}

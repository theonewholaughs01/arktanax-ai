import { describe, expect, it } from "vitest";
import { ARKTANAX_SYSTEM_PROMPT, buildAssistantMessages, deriveThreadTitle, extractLLMReply } from "./assistant";

describe("ARKTANAX assistant helpers", () => {
  it("builds an active conversation with the safety-bound assistant identity", () => {
    const messages = buildAssistantMessages([
      { role: "user", content: "Draft a concise daily plan." },
      { role: "assistant", content: "What are your three priorities?" },
    ]);

    expect(messages[0]).toEqual({ role: "system", content: ARKTANAX_SYSTEM_PROMPT });
    expect(messages.slice(1)).toEqual([
      { role: "user", content: "Draft a concise daily plan." },
      { role: "assistant", content: "What are your three priorities?" },
    ]);
    expect(ARKTANAX_SYSTEM_PROMPT).toContain("no connected external-device");
  });

  it("derives a concise thread title from the first user request", () => {
    expect(deriveThreadTitle("  Plan my focused workday  ")).toBe("Plan my focused workday");
    expect(deriveThreadTitle("x".repeat(70))).toHaveLength(64);
  });

  it("normalizes text content returned by the LLM", () => {
    expect(extractLLMReply("  Ready when you are.  ")).toBe("Ready when you are.");
    expect(extractLLMReply([{ type: "text", text: "First" }, { type: "text", text: "Second" }])).toBe("First\nSecond");
  });
});


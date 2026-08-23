import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  appendConversationMessage: vi.fn(),
  createConversationThread: vi.fn(),
  deleteConversationThread: vi.fn(),
  getAssistantFile: vi.fn(),
  getAssistantProfile: vi.fn(),
  getConversationThread: vi.fn(),
  getThreadMessages: vi.fn(),
  listConversationThreads: vi.fn(),
  renameConversationThread: vi.fn(),
  updateConversationMode: vi.fn(),
  upsertAssistantProfile: vi.fn(),
  invokeLLM: vi.fn(),
}));

vi.mock("./db", () => ({
  appendConversationMessage: mocks.appendConversationMessage,
  createConversationThread: mocks.createConversationThread,
  deleteConversationThread: mocks.deleteConversationThread,
  getAssistantFile: mocks.getAssistantFile,
  getAssistantProfile: mocks.getAssistantProfile,
  getConversationThread: mocks.getConversationThread,
  getThreadMessages: mocks.getThreadMessages,
  listConversationThreads: mocks.listConversationThreads,
  renameConversationThread: mocks.renameConversationThread,
  updateConversationMode: mocks.updateConversationMode,
  upsertAssistantProfile: mocks.upsertAssistantProfile,
}));

vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));

import { assistantRouter } from "./assistantRouter";

const USER_ID = 72;
const thread = {
  id: 91,
  userId: USER_ID,
  title: "Plan a focused workday",
  createdAt: new Date("2026-08-22T08:00:00Z"),
  updatedAt: new Date("2026-08-22T08:00:00Z"),
  lastMessageAt: new Date("2026-08-22T08:00:00Z"),
  mode: "fast" as const,
};

function createContext(): TrpcContext {
  return {
    user: {
      id: USER_ID,
      openId: "arktanax-test-user",
      name: "ARKTANAX Test",
      email: "test@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("assistantRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAssistantProfile.mockResolvedValue(undefined);
    mocks.getAssistantFile.mockResolvedValue(undefined);
  });

  it("persists a signed-in user’s prompt, hands active context to the LLM, and persists the reply", async () => {
    mocks.createConversationThread.mockResolvedValue(thread);
    mocks.getThreadMessages.mockResolvedValue([
      { id: 1, threadId: thread.id, userId: USER_ID, role: "user", content: "Plan a focused workday", createdAt: new Date() },
    ]);
    mocks.appendConversationMessage.mockResolvedValue({ id: 1 });
    mocks.invokeLLM.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Start with your most important outcome." } }],
    });

    const caller = assistantRouter.createCaller(createContext());
    const result = await caller.sendMessage({ content: "Plan a focused workday" });

    expect(mocks.createConversationThread).toHaveBeenCalledWith(USER_ID, "Plan a focused workday", "fast");
    expect(mocks.appendConversationMessage).toHaveBeenNthCalledWith(1, USER_ID, thread.id, "user", "Plan a focused workday");
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-3-flash-preview",
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({ role: "user", content: "Plan a focused workday" }),
      ]),
    }));
    expect(mocks.appendConversationMessage).toHaveBeenNthCalledWith(2, USER_ID, thread.id, "assistant", "Start with your most important outcome.");
    expect(result).toEqual({ threadId: thread.id, title: thread.title, reply: "Start with your most important outcome." });
  });

  it("retrieves a thread and its messages through the authenticated user scope", async () => {
    const messages = [{ id: 3, threadId: thread.id, userId: USER_ID, role: "assistant", content: "Context restored.", createdAt: new Date() }];
    mocks.getConversationThread.mockResolvedValue(thread);
    mocks.getThreadMessages.mockResolvedValue(messages);

    const caller = assistantRouter.createCaller(createContext());
    await expect(caller.getThread({ threadId: thread.id })).resolves.toEqual({ thread, messages });

    expect(mocks.getConversationThread).toHaveBeenCalledWith(USER_ID, thread.id);
    expect(mocks.getThreadMessages).toHaveBeenCalledWith(USER_ID, thread.id, 100);
  });

  it("reports an absent deletion target instead of claiming it was removed", async () => {
    mocks.deleteConversationThread.mockResolvedValue(false);
    const caller = assistantRouter.createCaller(createContext());

    await expect(caller.deleteThread({ threadId: thread.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.deleteConversationThread).toHaveBeenCalledWith(USER_ID, thread.id);
  });

  it("confirms a successful deletion only when the user-scoped data helper deletes the thread", async () => {
    mocks.deleteConversationThread.mockResolvedValue(true);
    const caller = assistantRouter.createCaller(createContext());

    await expect(caller.deleteThread({ threadId: thread.id })).resolves.toEqual({ success: true });
    expect(mocks.deleteConversationThread).toHaveBeenCalledWith(USER_ID, thread.id);
  });
});

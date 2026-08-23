import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createAssistantFile: vi.fn(),
  getAssistantFile: vi.fn(),
  listAssistantFiles: vi.fn(),
  invokeLLM: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./db", () => ({
  createAssistantFile: mocks.createAssistantFile,
  getAssistantFile: mocks.getAssistantFile,
  listAssistantFiles: mocks.listAssistantFiles,
}));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("./storage", () => ({ storageGetSignedUrl: mocks.storageGetSignedUrl, storagePut: mocks.storagePut }));

import { fileRouter } from "./fileRouter";

const USER_ID = 72;

function context(): TrpcContext {
  return {
    user: {
      id: USER_ID, openId: "file-test-user", name: "File Test", email: "file@test.local", loginMethod: "manus", role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("ARKTANAX file workspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a bounded source file and preserves text for context-aware code work", async () => {
    mocks.storagePut.mockResolvedValue({ key: "arktanax/72/files/source.ts", url: "/manus-storage/source.ts" });
    mocks.createAssistantFile.mockResolvedValue({ id: 9, fileName: "source.ts", kind: "source" });

    const caller = fileRouter.createCaller(context());
    const result = await caller.upload({
      fileName: "source.ts",
      mimeType: "text/plain",
      fileData: "data:text/plain;base64,Y29uc3QgbWVzc2FnZSA9ICdoZWxsbyc7",
    });

    expect(mocks.storagePut).toHaveBeenCalledWith(expect.stringContaining("source.ts"), expect.any(Buffer), "text/plain");
    expect(mocks.createAssistantFile).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      fileName: "source.ts", kind: "source", extractedText: "const message = 'hello';",
    }));
    expect(result).toEqual({ id: 9, fileName: "source.ts", kind: "source" });
  });

  it("provides a user-owned source file to Gemini for analysis without claiming execution", async () => {
    mocks.getAssistantFile.mockResolvedValue({
      id: 9, userId: USER_ID, fileName: "source.ts", storageKey: "arktanax/72/files/source.ts", mimeType: "text/plain", sizeBytes: 24,
      kind: "source", extractedText: "const message = 'hello';", createdAt: new Date(),
    });
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { role: "assistant", content: "The source defines a message constant." } }] });

    const caller = fileRouter.createCaller(context());
    await expect(caller.analyze({ fileId: 9, prompt: "Explain this file." })).resolves.toEqual({
      fileId: 9, analysis: "The source defines a message constant.",
    });
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-3-flash-preview",
      messages: expect.arrayContaining([expect.objectContaining({ role: "system", content: expect.stringContaining("Do not claim to execute code") })]),
    }));
  });
});

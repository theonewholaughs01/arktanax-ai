import { describe, expect, it, vi } from "vitest";
import { createConversationDbHelpers } from "./db";

const USER_ID = 42;
const THREAD_ID = 18;

function createQueryDb({ selectResults = [], messageResults = selectResults }: { selectResults?: unknown[]; messageResults?: unknown[] } = {}) {
  const messageLimit = vi.fn().mockResolvedValue(messageResults);
  const orderBy = vi.fn((...orderArguments: unknown[]) =>
    orderArguments.length > 1 ? { limit: messageLimit } : Promise.resolve(selectResults),
  );
  const limit = vi.fn().mockResolvedValue(selectResults);
  const where = vi.fn(() => ({ orderBy, limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const insertValues = vi.fn(() => ({ $returningId: vi.fn().mockResolvedValue([{ id: 99 }]) }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateWhere = vi.fn().mockResolvedValue({ affectedRows: 1 });
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn().mockResolvedValue({ affectedRows: 1 });
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  return {
    db: { select, insert, update, delete: deleteFn } as any,
    spies: { select, from, where, orderBy, messageLimit, insert, insertValues, update, updateSet, updateWhere, deleteFn, deleteWhere },
  };
}

describe("conversation database helpers", () => {
  it("lists and retrieves only through scoped thread query chains", async () => {
    const savedThread = { id: THREAD_ID, userId: USER_ID, title: "Saved thread" };
    const { db, spies } = createQueryDb({ selectResults: [savedThread] });
    const helpers = createConversationDbHelpers(db);

    await expect(helpers.listConversationThreads(USER_ID)).resolves.toEqual([savedThread]);
    await expect(helpers.getConversationThread(USER_ID, THREAD_ID)).resolves.toEqual(savedThread);

    expect(spies.where).toHaveBeenCalledTimes(2);
    expect(spies.orderBy).toHaveBeenCalledTimes(1);
    expect(spies.select).toHaveBeenCalledTimes(2);
  });

  it("returns messages in chronological order after querying the user-owned thread", async () => {
    const newest = { id: 2, content: "newest" };
    const oldest = { id: 1, content: "oldest" };
    const { db, spies } = createQueryDb({ messageResults: [newest, oldest] });
    const helpers = createConversationDbHelpers(db);

    const messages = await helpers.getThreadMessages(USER_ID, THREAD_ID, 24);

    expect(messages).toEqual([oldest, newest]);
    expect(spies.select).toHaveBeenCalledTimes(1);
    expect(spies.messageLimit).toHaveBeenCalledWith(24);
  });

  it("persists a message and updates the same user-owned thread activity", async () => {
    const { db, spies } = createQueryDb();
    const helpers = createConversationDbHelpers(db);

    await expect(helpers.appendConversationMessage(USER_ID, THREAD_ID, "user", "Keep this context.")).resolves.toEqual({ id: 99 });

    expect(spies.insertValues).toHaveBeenCalledWith({ userId: USER_ID, threadId: THREAD_ID, role: "user", content: "Keep this context." });
    expect(spies.updateSet).toHaveBeenCalledWith(expect.objectContaining({ lastMessageAt: expect.any(Date), updatedAt: expect.any(Date) }));
  });

  it("deletes messages before deleting an existing thread and leaves a missing thread untouched", async () => {
    const existing = createQueryDb({ selectResults: [{ id: THREAD_ID, userId: USER_ID }] });
    const existingHelpers = createConversationDbHelpers(existing.db);
    await expect(existingHelpers.deleteConversationThread(USER_ID, THREAD_ID)).resolves.toBe(true);
    expect(existing.spies.deleteFn).toHaveBeenCalledTimes(2);
    expect(existing.spies.deleteWhere).toHaveBeenCalledTimes(2);

    const missing = createQueryDb({ selectResults: [] });
    const missingHelpers = createConversationDbHelpers(missing.db);
    await expect(missingHelpers.deleteConversationThread(USER_ID, THREAD_ID)).resolves.toBe(false);
    expect(missing.spies.deleteFn).not.toHaveBeenCalled();
  });
});

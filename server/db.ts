import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { assistantMessages, assistantThreads, InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("Database is not available.");
  return db;
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function createConversationDbHelpers(db: Database) {
  const getConversationThread = async (userId: number, threadId: number) => {
    const result = await db
      .select()
      .from(assistantThreads)
      .where(and(eq(assistantThreads.id, threadId), eq(assistantThreads.userId, userId)))
      .limit(1);
    return result[0];
  };

  return {
    listConversationThreads: (userId: number) =>
      db
        .select()
        .from(assistantThreads)
        .where(eq(assistantThreads.userId, userId))
        .orderBy(desc(assistantThreads.lastMessageAt)),

    getConversationThread,

    async createConversationThread(userId: number, title: string) {
      const [created] = await db
        .insert(assistantThreads)
        .values({ userId, title })
        .$returningId();
      const thread = await getConversationThread(userId, created.id);
      if (!thread) throw new Error("Conversation could not be created.");
      return thread;
    },

    async renameConversationThread(userId: number, threadId: number, title: string) {
      await db
        .update(assistantThreads)
        .set({ title, updatedAt: new Date() })
        .where(and(eq(assistantThreads.id, threadId), eq(assistantThreads.userId, userId)));
      const thread = await getConversationThread(userId, threadId);
      if (!thread) throw new Error("Conversation could not be renamed.");
      return thread;
    },

    async getThreadMessages(userId: number, threadId: number, limit = 100) {
      const messages = await db
        .select()
        .from(assistantMessages)
        .where(and(eq(assistantMessages.userId, userId), eq(assistantMessages.threadId, threadId)))
        .orderBy(desc(assistantMessages.createdAt), desc(assistantMessages.id))
        .limit(limit);
      return messages.reverse();
    },

    async appendConversationMessage(
      userId: number,
      threadId: number,
      role: "user" | "assistant",
      content: string,
    ) {
      const [created] = await db
        .insert(assistantMessages)
        .values({ userId, threadId, role, content })
        .$returningId();

      const now = new Date();
      await db
        .update(assistantThreads)
        .set({ lastMessageAt: now, updatedAt: now })
        .where(and(eq(assistantThreads.id, threadId), eq(assistantThreads.userId, userId)));

      return created;
    },

    async deleteConversationThread(userId: number, threadId: number) {
      const thread = await getConversationThread(userId, threadId);
      if (!thread) return false;

      await db
        .delete(assistantMessages)
        .where(and(eq(assistantMessages.userId, userId), eq(assistantMessages.threadId, threadId)));
      await db
        .delete(assistantThreads)
        .where(and(eq(assistantThreads.id, threadId), eq(assistantThreads.userId, userId)));
      return true;
    },
  };
}

const withConversationDb = async <T>(callback: (helpers: ReturnType<typeof createConversationDbHelpers>) => Promise<T> | T) =>
  callback(createConversationDbHelpers(requireDb(await getDb())));

export const listConversationThreads = (userId: number) =>
  withConversationDb(helpers => helpers.listConversationThreads(userId));

export const getConversationThread = (userId: number, threadId: number) =>
  withConversationDb(helpers => helpers.getConversationThread(userId, threadId));

export const createConversationThread = (userId: number, title: string) =>
  withConversationDb(helpers => helpers.createConversationThread(userId, title));

export const renameConversationThread = (userId: number, threadId: number, title: string) =>
  withConversationDb(helpers => helpers.renameConversationThread(userId, threadId, title));

export const getThreadMessages = (userId: number, threadId: number, limit = 100) =>
  withConversationDb(helpers => helpers.getThreadMessages(userId, threadId, limit));

export const appendConversationMessage = (userId: number, threadId: number, role: "user" | "assistant", content: string) =>
  withConversationDb(helpers => helpers.appendConversationMessage(userId, threadId, role, content));

export const deleteConversationThread = (userId: number, threadId: number) =>
  withConversationDb(helpers => helpers.deleteConversationThread(userId, threadId));

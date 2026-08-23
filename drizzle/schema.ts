import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const assistantThreads = mysqlTable(
  "assistant_threads",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 160 }).notNull().default("New conversation"),
    mode: mysqlEnum("mode", ["fast", "deep", "code"]).notNull().default("fast"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  },
  table => ({
    userLastMessageIdx: index("assistant_threads_user_last_message_idx").on(
      table.userId,
      table.lastMessageAt,
    ),
  }),
);

export const assistantProfiles = mysqlTable("assistant_profiles", {
  userId: int("userId").primaryKey(),
  displayName: varchar("displayName", { length: 80 }),
  preferredMode: mysqlEnum("preferredMode", ["fast", "deep", "code"]).notNull().default("fast"),
  responseStyle: mysqlEnum("responseStyle", ["brief", "balanced", "detailed"]).notNull().default("balanced"),
  focusAreas: text("focusAreas"),
  workingStyle: text("workingStyle"),
  personalInstructions: text("personalInstructions"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const assistantFiles = mysqlTable(
  "assistant_files",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    threadId: int("threadId"),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    mimeType: varchar("mimeType", { length: 160 }).notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    kind: mysqlEnum("kind", ["source", "document"]).notNull(),
    extractedText: text("extractedText"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userCreatedIdx: index("assistant_files_user_created_idx").on(table.userId, table.createdAt),
    userThreadIdx: index("assistant_files_user_thread_idx").on(table.userId, table.threadId),
  }),
);

export const assistantMessages = mysqlTable(
  "assistant_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    threadId: int("threadId").notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    threadCreatedIdx: index("assistant_messages_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
    userThreadIdx: index("assistant_messages_user_thread_idx").on(
      table.userId,
      table.threadId,
    ),
  }),
);

export type AssistantThread = typeof assistantThreads.$inferSelect;
export type AssistantMessage = typeof assistantMessages.$inferSelect;
export type AssistantProfile = typeof assistantProfiles.$inferSelect;
export type AssistantFile = typeof assistantFiles.$inferSelect;

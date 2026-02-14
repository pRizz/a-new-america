import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  displayName: text("display_name").notNull().default("Anonymous"),
  oauthProvider: text("oauth_provider"),
  oauthId: text("oauth_id"),
  isValidAccount: boolean("is_valid_account").notNull().default(false),
  isAmerican: boolean("is_american").notNull().default(false),
  inferredCountryCode: varchar("inferred_country_code", { length: 2 }),
  inferredUsState: varchar("inferred_us_state", { length: 2 }),
  captchaDifficulty: integer("captcha_difficulty").notNull().default(75),
  captchaDebt: integer("captcha_debt").notNull().default(0),
  lastCaptchaDecayAt: timestamp("last_captcha_decay_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("users_oauth_id_unique").on(table.oauthId),
]);

export const names = pgTable("names", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  normalizedText: text("normalized_text").notNull(),
  eloAmerican: real("elo_american").notNull().default(1000),
  eloNonAmerican: real("elo_non_american").notNull().default(1000),
  voteCountTotal: integer("vote_count_total").notNull().default(0),
  voteCountAmerican: integer("vote_count_american").notNull().default(0),
  voteCountNonAmerican: integer("vote_count_non_american").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  submittedBy: varchar("submitted_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  lastVotedAt: timestamp("last_voted_at"),
}, (table) => [
  uniqueIndex("names_normalized_text_idx").on(table.normalizedText),
]);

export const votes = pgTable("votes", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 64 }).notNull(),
  winnerId: varchar("winner_id", { length: 64 }).notNull(),
  loserId: varchar("loser_id", { length: 64 }).notNull(),
  voteAttemptId: varchar("vote_attempt_id", { length: 64 }).notNull(),
  isAmerican: boolean("is_american").notNull().default(false),
  eloDelta: real("elo_delta").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("votes_attempt_idx").on(table.userId, table.voteAttemptId),
]);

export const captchaPlans = pgTable("captcha_plans", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 64 }),
  planType: text("plan_type").notNull(),
  requiredCount: integer("required_count").notNull(),
  completedCount: integer("completed_count").notNull().default(0),
  difficulty: integer("difficulty").notNull().default(75),
  isCompleted: boolean("is_completed").notNull().default(false),
  consumedAt: timestamp("consumed_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const captchaChallenges = pgTable("captcha_challenges", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id", { length: 64 }).notNull(),
  engineType: text("engine_type").notNull(),
  stepIndex: integer("step_index").notNull(),
  challengeData: text("challenge_data").notNull(),
  hashedAnswer: text("hashed_answer"),
  isSolved: boolean("is_solved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const globalConfig = pgTable("global_config", {
  id: varchar("id", { length: 64 }).primaryKey().default('singleton'),
  totalVotes: integer("total_votes").notNull().default(0),
  totalSubmissions: integer("total_submissions").notNull().default(0),
  globalMinCaptchaForSubmitName: integer("global_min_captcha_for_submit_name").notNull().default(85),
  globalMinCaptchaCountForSubmitName: integer("global_min_captcha_count_for_submit_name").notNull().default(15),
  connectedAmericans: integer("connected_americans").notNull().default(0),
  connectedNonAmericans: integer("connected_non_americans").notNull().default(0),
  lastConnectedRecomputeAt: timestamp("last_connected_recompute_at").defaultNow(),
});

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 64 }).notNull(),
  bucketType: text("bucket_type").notNull(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start").notNull().defaultNow(),
  windowEnd: timestamp("window_end").notNull(),
});

export const abuseEvents = pgTable("abuse_events", {
  id: varchar("id", { length: 64 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 64 }),
  eventType: text("event_type").notNull(),
  outcome: text("outcome").notNull(),
  reasonCode: text("reason_code").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, lastSeenAt: true, lastCaptchaDecayAt: true });
export const insertNameSchema = createInsertSchema(names).omit({ id: true, createdAt: true, lastVotedAt: true, eloAmerican: true, eloNonAmerican: true, voteCountTotal: true, voteCountAmerican: true, voteCountNonAmerican: true, isActive: true });
export const insertVoteSchema = createInsertSchema(votes).omit({ id: true, createdAt: true });

export const submitNameSchema = z.object({
  text: z.string().min(3).max(60).refine(val => /[a-zA-Z]/.test(val), "Must contain letters"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Name = typeof names.$inferSelect;
export type InsertName = z.infer<typeof insertNameSchema>;
export type Vote = typeof votes.$inferSelect;
export type InsertVote = z.infer<typeof insertVoteSchema>;
export type CaptchaPlan = typeof captchaPlans.$inferSelect;
export type CaptchaChallenge = typeof captchaChallenges.$inferSelect;
export type GlobalConfig = typeof globalConfig.$inferSelect;
export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type AbuseEvent = typeof abuseEvents.$inferSelect;

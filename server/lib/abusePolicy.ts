import { db } from "../db";
import { rateLimitBuckets, abuseEvents, users } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface PolicyCheck {
  allowed: boolean;
  reason?: string;
  reasonCode?: string;
}

export async function checkVoteRateLimit(userId: string): Promise<PolicyCheck> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const buckets = await db.select()
    .from(rateLimitBuckets)
    .where(
      and(
        eq(rateLimitBuckets.userId, userId),
        eq(rateLimitBuckets.bucketType, "vote_hourly"),
        gte(rateLimitBuckets.windowEnd, now)
      )
    );

  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total >= 120) {
    await logAbuseEvent(userId, "rate_limit", "blocked", "vote_hourly_exceeded");
    return { allowed: false, reason: "Rate limit: max 120 votes per hour", reasonCode: "vote_hourly_exceeded" };
  }

  return { allowed: true };
}

export async function incrementVoteRateLimit(userId: string): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000);

  const existing = await db.select()
    .from(rateLimitBuckets)
    .where(
      and(
        eq(rateLimitBuckets.userId, userId),
        eq(rateLimitBuckets.bucketType, "vote_hourly"),
        gte(rateLimitBuckets.windowEnd, now)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db.update(rateLimitBuckets)
      .set({ count: existing[0].count + 1 })
      .where(eq(rateLimitBuckets.id, existing[0].id));
  } else {
    await db.insert(rateLimitBuckets).values({
      id: randomUUID(),
      userId,
      bucketType: "vote_hourly",
      count: 1,
      windowStart: now,
      windowEnd,
    });
  }
}

export async function checkSubmitRateLimit(userId: string): Promise<PolicyCheck> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const buckets = await db.select()
    .from(rateLimitBuckets)
    .where(
      and(
        eq(rateLimitBuckets.userId, userId),
        eq(rateLimitBuckets.bucketType, "submit_daily"),
        gte(rateLimitBuckets.windowEnd, now)
      )
    );

  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total >= 2) {
    await logAbuseEvent(userId, "rate_limit", "blocked", "submit_daily_exceeded");
    return { allowed: false, reason: "Rate limit: max 2 submissions per day", reasonCode: "submit_daily_exceeded" };
  }

  return { allowed: true };
}

export async function incrementSubmitRateLimit(userId: string): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const existing = await db.select()
    .from(rateLimitBuckets)
    .where(
      and(
        eq(rateLimitBuckets.userId, userId),
        eq(rateLimitBuckets.bucketType, "submit_daily"),
        gte(rateLimitBuckets.windowEnd, now)
      )
    );

  if (existing.length > 0) {
    await db.update(rateLimitBuckets)
      .set({ count: existing[0].count + 1 })
      .where(eq(rateLimitBuckets.id, existing[0].id));
  } else {
    await db.insert(rateLimitBuckets).values({
      id: randomUUID(),
      userId,
      bucketType: "submit_daily",
      count: 1,
      windowStart: now,
      windowEnd,
    });
  }
}

export async function checkAccountAge(userId: string): Promise<PolicyCheck> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.createdAt) {
    return { allowed: false, reason: "User not found", reasonCode: "user_not_found" };
  }

  const ageHours = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60);
  if (ageHours < 24) {
    return {
      allowed: false,
      reason: `Account must be at least 24 hours old. Current age: ${ageHours.toFixed(1)} hours.`,
      reasonCode: "account_too_young",
    };
  }

  return { allowed: true };
}

export async function logAbuseEvent(
  userId: string | null,
  eventType: string,
  outcome: string,
  reasonCode: string,
  metadata?: string
): Promise<void> {
  await db.insert(abuseEvents).values({
    id: randomUUID(),
    userId,
    eventType,
    outcome,
    reasonCode,
    metadata,
  });
}

const BLOCKLIST = [
  "nazi", "hitler", "kkk", "n1gger", "nigger", "fag", "faggot",
  "kill all", "death to", "genocide",
];

export function isBlockedName(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKLIST.some(term => lower.includes(term));
}

export function validateNameText(text: string): { valid: boolean; reason?: string } {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length < 3) return { valid: false, reason: "Name must be at least 3 characters" };
  if (trimmed.length > 60) return { valid: false, reason: "Name must be 60 characters or less" };
  if (!/[a-zA-Z]/.test(trimmed)) return { valid: false, reason: "Name must contain letters" };
  if (/^(.)\1+$/.test(trimmed.replace(/\s/g, ""))) return { valid: false, reason: "Name cannot be repeated characters" };
  if (isBlockedName(trimmed)) return { valid: false, reason: "Name contains prohibited content" };
  return { valid: true };
}

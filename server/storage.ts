import { db } from "./db";
import { users, names, votes, captchaPlans, captchaChallenges, globalConfig, rateLimitBuckets, abuseEvents } from "@shared/schema";
import { captchaConfig } from "./lib/captcha/config";
import type { User, InsertUser, Name, InsertName, Vote, InsertVote, CaptchaPlan, CaptchaChallenge, GlobalConfig } from "@shared/schema";
import { eq, and, ne, sql, desc, asc, gte, lte, lt, count, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByClerkId(clerkId: string): Promise<User | undefined>;
  createUser(user: Partial<InsertUser> & { id?: string }): Promise<User>;
  upsertClerkUser(data: { displayName: string; oauthId: string; isValidAccount: boolean }): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllNames(activeOnly?: boolean): Promise<Name[]>;
  getNameById(id: string): Promise<Name | undefined>;
  getNameByNormalized(normalizedText: string): Promise<Name | undefined>;
  createName(data: { text: string; normalizedText: string; submittedBy?: string }): Promise<Name>;
  updateName(id: string, data: Partial<Name>): Promise<void>;
  getRandomMatchup(): Promise<{ nameA: Name; nameB: Name } | null>;
  createVote(data: InsertVote): Promise<Vote>;
  getVoteByAttempt(userId: string, voteAttemptId: string): Promise<Vote | undefined>;
  createCaptchaPlan(data: { userId?: string; planType: string; requiredCount: number; difficulty: number }): Promise<CaptchaPlan>;
  getCaptchaPlan(id: string): Promise<CaptchaPlan | undefined>;
  updateCaptchaPlan(id: string, data: Partial<CaptchaPlan>): Promise<void>;
  createCaptchaChallenge(data: { planId: string; engineType: string; stepIndex: number; challengeData: string; hashedAnswer: string | null }): Promise<CaptchaChallenge>;
  getCaptchaChallenge(id: string): Promise<CaptchaChallenge | undefined>;
  updateCaptchaChallenge(id: string, data: Partial<CaptchaChallenge>): Promise<void>;
  getGlobalConfig(): Promise<GlobalConfig>;
  updateGlobalConfig(data: Partial<GlobalConfig>): Promise<void>;
  getConnectedCounts(): Promise<{ americans: number; nonAmericans: number }>;
  deleteUser(userId: string): Promise<void>;
  cleanupExpiredCaptchas(): Promise<number>;
  seed(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByClerkId(clerkId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(and(eq(users.oauthProvider, "clerk"), eq(users.oauthId, clerkId))).limit(1);
    return user;
  }

  async upsertClerkUser(data: { displayName: string; oauthId: string; isValidAccount: boolean }): Promise<User> {
    const [user] = await db.insert(users).values({
      id: randomUUID(),
      displayName: data.displayName,
      oauthProvider: "clerk",
      oauthId: data.oauthId,
      isValidAccount: data.isValidAccount,
      isAmerican: false,
    }).onConflictDoUpdate({
      target: users.oauthId,
      set: {
        lastSeenAt: new Date(),
        displayName: data.displayName,
        ...(data.isValidAccount ? { isValidAccount: true } : {}),
      },
    }).returning();
    return user;
  }

  async createUser(data: Partial<InsertUser> & { id?: string }): Promise<User> {
    const id = data.id || randomUUID();
    const [user] = await db.insert(users).values({
      id,
      displayName: data.displayName || "Anonymous",
      oauthProvider: data.oauthProvider,
      oauthId: data.oauthId,
      isValidAccount: data.isValidAccount ?? false,
      isAmerican: data.isAmerican ?? false,
      inferredCountryCode: data.inferredCountryCode,
      inferredUsState: data.inferredUsState,
      captchaDifficulty: data.captchaDifficulty ?? captchaConfig.defaultUserCaptchaDifficulty,
      captchaDebt: data.captchaDebt ?? 0,
    }).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async getAllNames(activeOnly = true): Promise<Name[]> {
    if (activeOnly) {
      return db.select().from(names).where(eq(names.isActive, true));
    }
    return db.select().from(names);
  }

  async getNameById(id: string): Promise<Name | undefined> {
    const [name] = await db.select().from(names).where(eq(names.id, id)).limit(1);
    return name;
  }

  async getNameByNormalized(normalizedText: string): Promise<Name | undefined> {
    const [name] = await db.select().from(names).where(eq(names.normalizedText, normalizedText)).limit(1);
    return name;
  }

  async createName(data: { text: string; normalizedText: string; submittedBy?: string }): Promise<Name> {
    const [name] = await db.insert(names).values({
      id: randomUUID(),
      text: data.text,
      normalizedText: data.normalizedText,
      submittedBy: data.submittedBy,
    }).returning();
    return name;
  }

  async updateName(id: string, data: Partial<Name>): Promise<void> {
    await db.update(names).set(data).where(eq(names.id, id));
  }

  async getRandomMatchup(): Promise<{ nameA: Name; nameB: Name } | null> {
    const allNames = await db.select().from(names).where(eq(names.isActive, true));
    if (allNames.length < 2) return null;
    const shuffled = allNames.sort(() => Math.random() - 0.5);
    return { nameA: shuffled[0], nameB: shuffled[1] };
  }

  async createVote(data: InsertVote): Promise<Vote> {
    const [vote] = await db.insert(votes).values({
      id: randomUUID(),
      ...data,
    }).returning();
    return vote;
  }

  async getVoteByAttempt(userId: string, voteAttemptId: string): Promise<Vote | undefined> {
    const [vote] = await db.select().from(votes).where(
      and(eq(votes.userId, userId), eq(votes.voteAttemptId, voteAttemptId))
    ).limit(1);
    return vote;
  }

  async createCaptchaPlan(data: { userId?: string; planType: string; requiredCount: number; difficulty: number }): Promise<CaptchaPlan> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const [plan] = await db.insert(captchaPlans).values({
      id: randomUUID(),
      userId: data.userId || null,
      planType: data.planType,
      requiredCount: data.requiredCount,
      difficulty: data.difficulty,
      expiresAt,
    }).returning();
    return plan;
  }

  async getCaptchaPlan(id: string): Promise<CaptchaPlan | undefined> {
    const [plan] = await db.select().from(captchaPlans).where(eq(captchaPlans.id, id)).limit(1);
    return plan;
  }

  async updateCaptchaPlan(id: string, data: Partial<CaptchaPlan>): Promise<void> {
    await db.update(captchaPlans).set(data).where(eq(captchaPlans.id, id));
  }

  async createCaptchaChallenge(data: { planId: string; engineType: string; stepIndex: number; challengeData: string; hashedAnswer: string | null }): Promise<CaptchaChallenge> {
    const [challenge] = await db.insert(captchaChallenges).values({
      id: randomUUID(),
      ...data,
    }).returning();
    return challenge;
  }

  async getCaptchaChallenge(id: string): Promise<CaptchaChallenge | undefined> {
    const [challenge] = await db.select().from(captchaChallenges).where(eq(captchaChallenges.id, id)).limit(1);
    return challenge;
  }

  async updateCaptchaChallenge(id: string, data: Partial<CaptchaChallenge>): Promise<void> {
    await db.update(captchaChallenges).set(data).where(eq(captchaChallenges.id, id));
  }

  async getGlobalConfig(): Promise<GlobalConfig> {
    const [config] = await db.select().from(globalConfig).limit(1);
    if (!config) {
      const [newConfig] = await db.insert(globalConfig).values({
        id: "singleton",
      }).returning();
      return newConfig;
    }
    return config;
  }

  async updateGlobalConfig(data: Partial<GlobalConfig>): Promise<void> {
    await db.update(globalConfig).set(data).where(eq(globalConfig.id, "singleton"));
  }

  async getConnectedCounts(): Promise<{ americans: number; nonAmericans: number }> {
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const amResult = await db.select({ count: count() }).from(users).where(
      and(eq(users.isAmerican, true), gte(users.lastSeenAt, fifteenMinsAgo))
    );
    const nonAmResult = await db.select({ count: count() }).from(users).where(
      and(eq(users.isAmerican, false), gte(users.lastSeenAt, fifteenMinsAgo))
    );
    return {
      americans: amResult[0]?.count ?? 0,
      nonAmericans: nonAmResult[0]?.count ?? 0,
    };
  }

  async deleteUser(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const userPlans = await tx.select({ id: captchaPlans.id })
        .from(captchaPlans)
        .where(eq(captchaPlans.userId, userId));
      const planIds = userPlans.map(p => p.id);

      if (planIds.length > 0) {
        await tx.delete(captchaChallenges).where(inArray(captchaChallenges.planId, planIds));
      }
      await tx.delete(captchaPlans).where(eq(captchaPlans.userId, userId));
      await tx.delete(votes).where(eq(votes.userId, userId));
      await tx.delete(rateLimitBuckets).where(eq(rateLimitBuckets.userId, userId));
      await tx.delete(abuseEvents).where(eq(abuseEvents.userId, userId));
      await tx.delete(users).where(eq(users.id, userId));
    });
  }

  async cleanupExpiredCaptchas(): Promise<number> {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const expiredPlans = await db.select({ id: captchaPlans.id })
      .from(captchaPlans)
      .where(lt(captchaPlans.expiresAt, cutoff));

    if (expiredPlans.length === 0) return 0;

    const expiredIds = expiredPlans.map(p => p.id);

    await db.delete(captchaChallenges).where(inArray(captchaChallenges.planId, expiredIds));
    await db.delete(captchaPlans).where(inArray(captchaPlans.id, expiredIds));

    return expiredIds.length;
  }

  async seed(): Promise<void> {
    const existing = await db.select().from(names).limit(1);
    if (existing.length > 0) return;

    const seedNames = [
      "The United Countries of America",
      "The United Cities of America",
      "The United City-States of America",
      "The People's Republic of North America",
      "The Federal States of Columbia",
      "The American Commonwealth",
      "New Turtle Island",
      "The Continental Union",
      "Freedomland",
      "The North American Federation",
      "The Stars & Stripes Republic",
      "Amer-i-can't Believe It's Not Butter",
      "The Great Experiment 2.0",
    ];

    for (const name of seedNames) {
      await db.insert(names).values({
        id: randomUUID(),
        text: name,
        normalizedText: name.toLowerCase().trim().replace(/\s+/g, " "),
      });
    }

    await this.getGlobalConfig();
  }
}

export const storage = new DatabaseStorage();

import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { calculateElo } from "./lib/elo";
import { generateChallenge, verifyPoW, verifyHashedAnswer, type EngineType } from "./lib/captcha/engines";
import { getEngineSequence, computeVoteRequirements, computeSubmitRequirements, applyDecay } from "./lib/captcha/plans";
import { checkVoteRateLimit, incrementVoteRateLimit, checkSubmitRateLimit, incrementSubmitRateLimit, checkAccountAge, logAbuseEvent, validateNameText } from "./lib/abusePolicy";
import { randomUUID } from "crypto";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { requireSessionSecret } from "./env";
let geoip: any = null;
try {
  geoip = require("geoip-lite");
} catch {
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    completedPreauthPlanId?: string;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        pool: pool,
        createTableIfMissing: true,
      }),
      secret: requireSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })
  );

  await storage.seed();

  async function applyUserDecay(userId: string) {
    const user = await storage.getUser(userId);
    if (!user) return user;
    const { captchaDifficulty, captchaDebt, decayPeriods } = applyDecay(
      user.captchaDifficulty,
      user.captchaDebt,
      user.lastCaptchaDecayAt
    );
    if (decayPeriods > 0) {
      const now = new Date();
      await storage.updateUser(userId, {
        captchaDifficulty,
        captchaDebt,
        lastCaptchaDecayAt: now,
      });
      return { ...user, captchaDifficulty, captchaDebt, lastCaptchaDecayAt: now };
    }
    return user;
  }

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await applyUserDecay(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    res.json(user);
  });

  app.delete("/api/auth/account", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const captchaPlanId = req.body?.captchaPlanId || req.headers["x-captcha-plan-id"] as string;
      if (!captchaPlanId) return res.status(400).json({ message: "Captcha verification required" });

      const plan = await storage.getCaptchaPlan(captchaPlanId);
      if (!plan || !plan.isCompleted) return res.status(400).json({ message: "Captcha not completed" });
      if (plan.consumedAt) return res.status(400).json({ message: "Captcha already used" });
      if (new Date() > plan.expiresAt) return res.status(400).json({ message: "Captcha expired" });
      if (plan.planType !== "delete") return res.status(400).json({ message: "Wrong captcha type" });
      if (plan.userId !== req.session.userId) return res.status(403).json({ message: "Captcha plan mismatch" });

      await storage.updateCaptchaPlan(captchaPlanId, { consumedAt: new Date() });
      await storage.deleteUser(user.id);

      req.session.destroy((err) => {
        if (err) console.error("[account-delete] Session destroy error:", err);
        res.json({ deleted: true });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const clerkPubKey = process.env.VITE_CLERK_PUBLISHABLE_KEY || "";
  const clerkFrontendApi = (() => {
    try {
      const raw = clerkPubKey.replace(/^pk_(test|live)_/, "");
      return Buffer.from(raw, "base64").toString("utf-8").replace(/\$$/, "");
    } catch { return ""; }
  })();
  const clerkJWKS = clerkFrontendApi
    ? createRemoteJWKSet(new URL(`https://${clerkFrontendApi}/.well-known/jwks.json`))
    : null;

  app.post("/api/auth/clerk-sync", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Missing authorization token" });
      }

      const token = authHeader.split(" ")[1];
      if (!clerkJWKS) {
        return res.status(500).json({ message: "Clerk not configured" });
      }

      let clerkUserId: string;
      try {
        const { payload } = await jwtVerify(token, clerkJWKS, {
          issuer: `https://${clerkFrontendApi}`,
        });
        clerkUserId = payload.sub as string;
        if (!clerkUserId) throw new Error("No sub claim");
      } catch (err: any) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const { displayName } = req.body;

      if (req.session.userId) {
        const existing = await storage.getUser(req.session.userId);
        if (existing && existing.oauthProvider === "clerk" && existing.oauthId === clerkUserId) {
          await storage.updateUser(existing.id, { lastSeenAt: new Date() });
          res.json(existing);
          return;
        }
      }

      let autoActivate = false;
      if (req.session.completedPreauthPlanId) {
        const preauthPlan = await storage.getCaptchaPlan(req.session.completedPreauthPlanId);
        if (preauthPlan && preauthPlan.isCompleted && preauthPlan.planType === "preauth" && !preauthPlan.consumedAt && new Date() < preauthPlan.expiresAt) {
          autoActivate = true;
          await storage.updateCaptchaPlan(preauthPlan.id, { consumedAt: new Date() });
        }
        delete req.session.completedPreauthPlanId;
      }

      const user = await storage.upsertClerkUser({
        displayName: displayName || "Voter",
        oauthId: clerkUserId,
        isValidAccount: autoActivate,
      });

      req.session.userId = user.id;
      if (user.createdAt && (Date.now() - new Date(user.createdAt).getTime()) < 5000) {
        await logAbuseEvent(user.id, "account_created", "allowed", autoActivate ? "preauth_captcha_verified" : "clerk_auth_pending_captcha");
      }
      res.json(user);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/activate", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "User not found" });
      if (user.isValidAccount) return res.json({ activated: true, user });

      const { captchaPlanId } = req.body;
      if (!captchaPlanId) return res.status(400).json({ message: "Missing captcha plan" });

      const plan = await storage.getCaptchaPlan(captchaPlanId);
      if (!plan || !plan.isCompleted) return res.status(400).json({ message: "Captcha not completed" });
      if (plan.consumedAt) return res.status(400).json({ message: "Captcha already used" });
      if (new Date() > plan.expiresAt) return res.status(400).json({ message: "Captcha expired" });
      if (plan.planType !== "registration") return res.status(400).json({ message: "Wrong captcha type" });
      if (plan.userId !== req.session.userId) return res.status(403).json({ message: "Captcha plan mismatch" });

      await storage.updateCaptchaPlan(captchaPlanId, { consumedAt: new Date() });
      await storage.updateUser(req.session.userId, { isValidAccount: true });
      await logAbuseEvent(req.session.userId, "account_activated", "allowed", "captcha_verified");

      const updated = await storage.getUser(req.session.userId);
      res.json({ activated: true, user: updated });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/stats", async (_req, res) => {
    try {
      const config = await storage.getGlobalConfig();
      const now = Date.now();
      const lastRecompute = config.lastConnectedRecomputeAt ? new Date(config.lastConnectedRecomputeAt).getTime() : 0;
      let americans = config.connectedAmericans;
      let nonAmericans = config.connectedNonAmericans;

      const TAU = 2 * Math.PI;
      if (now - lastRecompute > TAU * 5 * 1000) {
        const counts = await storage.getConnectedCounts();
        americans = counts.americans;
        nonAmericans = counts.nonAmericans;
        await storage.updateGlobalConfig({
          connectedAmericans: americans,
          connectedNonAmericans: nonAmericans,
          lastConnectedRecomputeAt: new Date(),
        });
      }

      res.json({
        totalVotes: config.totalVotes,
        connectedAmericans: americans,
        connectedNonAmericans: nonAmericans,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ping", async (req, res) => {
    if (req.session.userId) {
      await storage.updateUser(req.session.userId, { lastSeenAt: new Date() });
    }
    res.json({ ok: true });
  });

  app.get("/api/names", async (_req, res) => {
    try {
      const allNames = await storage.getAllNames(true);
      res.json(allNames);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/vote/matchup", async (req, res) => {
    try {
      const sessionKey = req.sessionID || "anon";
      const matchupCheck = matchupLimiter.check(sessionKey);
      if (!matchupCheck.allowed) {
        return res.status(429).json({ message: "Too many requests. Please slow down." });
      }
      matchupLimiter.record(sessionKey);

      const matchup = await storage.getRandomMatchup();
      if (!matchup) return res.status(404).json({ message: "Not enough names" });
      res.json({
        nameA: matchup.nameA,
        nameB: matchup.nameB,
        voteAttemptId: randomUUID(),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/vote", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });

      const voter = await storage.getUser(req.session.userId);
      if (!voter || !voter.isValidAccount) return res.status(403).json({ message: "Account not activated" });

      const { winnerId, loserId, voteAttemptId, captchaPlanId } = req.body;
      if (!winnerId || !loserId || !voteAttemptId || !captchaPlanId) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const plan = await storage.getCaptchaPlan(captchaPlanId);
      if (!plan || !plan.isCompleted) return res.status(400).json({ message: "Captcha not completed" });
      if (plan.consumedAt) return res.status(400).json({ message: "Captcha already used" });
      if (new Date() > plan.expiresAt) return res.status(400).json({ message: "Captcha expired" });
      if (plan.planType !== "vote") return res.status(400).json({ message: "Wrong captcha type" });
      if (plan.userId !== req.session.userId) return res.status(403).json({ message: "Captcha plan mismatch" });

      const existingVote = await storage.getVoteByAttempt(req.session.userId, voteAttemptId);
      if (existingVote) return res.status(409).json({ message: "Vote already submitted" });

      const rateCheck = await checkVoteRateLimit(req.session.userId);
      if (!rateCheck.allowed) return res.status(429).json({ message: rateCheck.reason });

      const user = await applyUserDecay(req.session.userId);
      if (!user) return res.status(401).json({ message: "User not found" });

      const winner = await storage.getNameById(winnerId);
      const loser = await storage.getNameById(loserId);
      if (!winner || !loser) return res.status(404).json({ message: "Name not found" });

      const eloKey = user.isAmerican ? "eloAmerican" : "eloNonAmerican";
      const voteCountKey = user.isAmerican ? "voteCountAmerican" : "voteCountNonAmerican";
      const { winnerNew, loserNew, delta } = calculateElo(winner[eloKey], loser[eloKey]);

      await storage.updateName(winnerId, {
        [eloKey]: winnerNew,
        voteCountTotal: winner.voteCountTotal + 1,
        [voteCountKey]: winner[voteCountKey] + 1,
        lastVotedAt: new Date(),
      });
      await storage.updateName(loserId, {
        [eloKey]: loserNew,
        voteCountTotal: loser.voteCountTotal + 1,
        [voteCountKey]: loser[voteCountKey] + 1,
        lastVotedAt: new Date(),
      });

      const vote = await storage.createVote({
        userId: req.session.userId,
        winnerId,
        loserId,
        voteAttemptId,
        isAmerican: user.isAmerican,
        eloDelta: delta,
      });

      await incrementVoteRateLimit(req.session.userId);
      await storage.updateCaptchaPlan(captchaPlanId, { consumedAt: new Date() });

      const newDebt = Math.min(user.captchaDebt + 10, 1000);
      const newDifficulty = Math.min(user.captchaDifficulty + 1, 95);
      await storage.updateUser(req.session.userId, {
        captchaDebt: newDebt,
        captchaDifficulty: newDifficulty,
        lastSeenAt: new Date(),
      });

      const config = await storage.getGlobalConfig();
      await storage.updateGlobalConfig({ totalVotes: config.totalVotes + 1 });

      await logAbuseEvent(req.session.userId, "vote", "allowed", "vote_success");

      res.json({
        vote,
        winnerName: winner.text,
        loserName: loser.text,
        eloDelta: delta,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/user/captcha-info", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await applyUserDecay(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });

    const { voteRequiredCount, voteDifficulty } = computeVoteRequirements(user.captchaDifficulty, user.captchaDebt);
    res.json({
      captchaDifficulty: user.captchaDifficulty,
      captchaDebt: user.captchaDebt,
      voteRequiredCount,
      voteDifficulty,
    });
  });

  app.get("/api/user/profile", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });

    let detectedCountry: string | null = null;
    try {
      const forwarded = req.headers["x-forwarded-for"];
      const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "";
      const geo = geoip?.lookup?.(ip);
      if (geo) {
        detectedCountry = geo.country;
      }
    } catch {}

    res.json({
      id: user.id,
      displayName: user.displayName,
      isValidAccount: user.isValidAccount,
      createdAt: user.createdAt,
      detectedCountry,
    });
  });

  app.get("/api/user/submit-info", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await applyUserDecay(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });

    if (!user.isValidAccount) {
      return res.json({ canSubmit: false, reason: "Account not valid", captchaDifficulty: user.captchaDifficulty, captchaDebt: user.captchaDebt, submitRequiredCount: 15, submitDifficulty: 85 });
    }

    const ageCheck = await checkAccountAge(req.session.userId);
    const ageHours = user.createdAt ? (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60) : 0;

    const submitRateCheck = await checkSubmitRateLimit(req.session.userId);

    const config = await storage.getGlobalConfig();
    const { submitRequiredCount, submitDifficulty } = computeSubmitRequirements(
      user.captchaDifficulty,
      user.captchaDebt,
      config.globalMinCaptchaForSubmitName,
      config.globalMinCaptchaCountForSubmitName
    );

    let canSubmit = true;
    let reason: string | undefined;

    if (!ageCheck.allowed) { canSubmit = false; reason = ageCheck.reason; }
    else if (!submitRateCheck.allowed) { canSubmit = false; reason = submitRateCheck.reason; }

    res.json({
      canSubmit,
      reason,
      accountAgeHours: ageHours,
      submitRequiredCount,
      submitDifficulty,
      captchaDifficulty: user.captchaDifficulty,
      captchaDebt: user.captchaDebt,
    });
  });

  app.post("/api/names/submit", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await applyUserDecay(req.session.userId);
      if (!user || !user.isValidAccount) return res.status(403).json({ message: "Account not valid" });

      const { text, captchaPlanId } = req.body;
      if (!text || !captchaPlanId) return res.status(400).json({ message: "Missing fields" });

      const plan = await storage.getCaptchaPlan(captchaPlanId);
      if (!plan || !plan.isCompleted) return res.status(400).json({ message: "Captcha not completed" });
      if (plan.consumedAt) return res.status(400).json({ message: "Captcha already used" });
      if (new Date() > plan.expiresAt) return res.status(400).json({ message: "Captcha expired" });
      if (plan.planType !== "submit") return res.status(400).json({ message: "Wrong captcha type" });
      if (plan.userId !== req.session.userId) return res.status(403).json({ message: "Captcha plan mismatch" });

      const ageCheck = await checkAccountAge(req.session.userId);
      if (!ageCheck.allowed) return res.status(403).json({ message: ageCheck.reason });

      const rateCheck = await checkSubmitRateLimit(req.session.userId);
      if (!rateCheck.allowed) return res.status(429).json({ message: rateCheck.reason });

      const validation = validateNameText(text);
      if (!validation.valid) return res.status(400).json({ message: validation.reason });

      const normalizedText = text.trim().replace(/\s+/g, " ").toLowerCase();
      const existing = await storage.getNameByNormalized(normalizedText);
      if (existing) return res.status(409).json({ message: "This name already exists" });

      const name = await storage.createName({
        text: text.trim().replace(/\s+/g, " "),
        normalizedText,
        submittedBy: req.session.userId,
      });

      await incrementSubmitRateLimit(req.session.userId);
      await storage.updateCaptchaPlan(captchaPlanId, { consumedAt: new Date() });

      const config = await storage.getGlobalConfig();
      const newTotalSubmissions = config.totalSubmissions + 1;
      const newMinDifficulty = Math.min(95, config.globalMinCaptchaForSubmitName + 2);
      const newMinCount = newTotalSubmissions % 25 === 0
        ? Math.min(25, config.globalMinCaptchaCountForSubmitName + 1)
        : config.globalMinCaptchaCountForSubmitName;

      await storage.updateGlobalConfig({
        totalSubmissions: newTotalSubmissions,
        globalMinCaptchaForSubmitName: newMinDifficulty,
        globalMinCaptchaCountForSubmitName: newMinCount,
      });

      await logAbuseEvent(req.session.userId, "name_submitted", "allowed", "submission_success", JSON.stringify({ nameId: name.id, text: name.text }));

      res.json({ name: name.text, id: name.id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/captcha/start", async (req, res) => {
    try {
      const sessionKey = req.sessionID || "anon";
      const startCheck = captchaStartLimiter.check(sessionKey);
      if (!startCheck.allowed) {
        return res.status(429).json({ message: "Too many captcha requests. Please wait before trying again." });
      }
      captchaStartLimiter.record(sessionKey);

      const { planType } = req.body;
      if (!planType) return res.status(400).json({ message: "Plan type required" });

      const sessionUserId = req.session.userId || null;

      if ((planType === "vote" || planType === "submit" || planType === "registration" || planType === "delete") && !sessionUserId) {
        return res.status(401).json({ message: "Authentication required for this captcha type" });
      }

      let requiredCount = 4;
      let difficulty = 80;

      if (planType === "preauth") {
        if (req.session.completedPreauthPlanId) {
          return res.status(400).json({ message: "Preauth already completed" });
        }
        requiredCount = 4;
        difficulty = 80;
      } else if (planType === "registration") {
        if (sessionUserId) {
          const regUser = await storage.getUser(sessionUserId);
          if (regUser?.isValidAccount) {
            return res.status(400).json({ message: "Account already activated" });
          }
        }
        requiredCount = 4;
        difficulty = 80;
      } else if (planType === "vote" && sessionUserId) {
        const user = await applyUserDecay(sessionUserId);
        if (user) {
          const reqs = computeVoteRequirements(user.captchaDifficulty, user.captchaDebt);
          requiredCount = reqs.voteRequiredCount;
          difficulty = reqs.voteDifficulty;
        }
      } else if (planType === "submit" && sessionUserId) {
        const user = await applyUserDecay(sessionUserId);
        if (user) {
          const config = await storage.getGlobalConfig();
          const reqs = computeSubmitRequirements(
            user.captchaDifficulty,
            user.captchaDebt,
            config.globalMinCaptchaForSubmitName,
            config.globalMinCaptchaCountForSubmitName
          );
          requiredCount = reqs.submitRequiredCount;
          difficulty = reqs.submitDifficulty;
        }
      } else if (planType === "delete") {
        requiredCount = 2;
        difficulty = 75;
      }

      const plan = await storage.createCaptchaPlan({
        userId: sessionUserId || undefined,
        planType,
        requiredCount,
        difficulty,
      });

      const sequence = getEngineSequence(planType, requiredCount);
      const engineType = sequence[0];
      const challengeResult = generateChallenge(engineType, difficulty);

      const challenge = await storage.createCaptchaChallenge({
        planId: plan.id,
        engineType: challengeResult.engineType,
        stepIndex: 0,
        challengeData: challengeResult.challengeData,
        hashedAnswer: challengeResult.hashedAnswer,
      });

      res.json({
        planId: plan.id,
        challengeId: challenge.id,
        engineType: challenge.engineType,
        stepIndex: 0,
        totalSteps: requiredCount,
        completedSteps: 0,
        data: JSON.parse(challenge.challengeData),
        difficulty,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  function createRateLimiter(maxRequests: number, windowMs: number, lockoutMs: number) {
    const tracker = new Map<string, { timestamps: number[]; lockoutUntil: number | null }>();
    return {
      check(key: string): { allowed: boolean; remaining: number; lockoutUntil: number | null } {
        const now = Date.now();
        const entry = tracker.get(key) || { timestamps: [], lockoutUntil: null };
        if (entry.lockoutUntil && now < entry.lockoutUntil) {
          return { allowed: false, remaining: 0, lockoutUntil: entry.lockoutUntil };
        }
        if (entry.lockoutUntil && now >= entry.lockoutUntil) {
          entry.lockoutUntil = null;
          entry.timestamps = [];
          tracker.set(key, entry);
        }
        const recent = entry.timestamps.filter(t => t > now - windowMs);
        entry.timestamps = recent;
        tracker.set(key, entry);
        return { allowed: recent.length < maxRequests, remaining: maxRequests - recent.length, lockoutUntil: null };
      },
      record(key: string): { lockedOut: boolean; lockoutUntil: number | null; remaining: number } {
        const now = Date.now();
        const entry = tracker.get(key) || { timestamps: [], lockoutUntil: null };
        entry.timestamps.push(now);
        const recent = entry.timestamps.filter(t => t > now - windowMs);
        entry.timestamps = recent;
        if (recent.length >= maxRequests) {
          entry.lockoutUntil = now + lockoutMs;
          tracker.set(key, entry);
          return { lockedOut: true, lockoutUntil: entry.lockoutUntil, remaining: 0 };
        }
        tracker.set(key, entry);
        return { lockedOut: false, lockoutUntil: null, remaining: maxRequests - recent.length };
      },
    };
  }

  const captchaStartLimiter = createRateLimiter(20, 5 * 60 * 1000, 5 * 60 * 1000);
  const matchupLimiter = createRateLimiter(60, 60 * 1000, 60 * 1000);

  const regenTracker = new Map<string, { timestamps: number[]; lockoutUntil: number | null }>();
  const REGEN_MAX = 10;
  const REGEN_WINDOW_MS = 5 * 60 * 1000;
  const REGEN_LOCKOUT_MS = 5 * 60 * 1000;

  function getRegenState(sessionId: string): { allowed: boolean; remaining: number; lockoutUntil: number | null } {
    const now = Date.now();
    const entry = regenTracker.get(sessionId) || { timestamps: [], lockoutUntil: null };

    if (entry.lockoutUntil && now < entry.lockoutUntil) {
      return { allowed: false, remaining: 0, lockoutUntil: entry.lockoutUntil };
    }

    if (entry.lockoutUntil && now >= entry.lockoutUntil) {
      entry.lockoutUntil = null;
      entry.timestamps = [];
      regenTracker.set(sessionId, entry);
    }

    const recent = entry.timestamps.filter(t => t > now - REGEN_WINDOW_MS);
    entry.timestamps = recent;
    regenTracker.set(sessionId, entry);

    return { allowed: true, remaining: REGEN_MAX - recent.length, lockoutUntil: null };
  }

  function recordRegen(sessionId: string): { lockedOut: boolean; lockoutUntil: number | null; remaining: number } {
    const now = Date.now();
    const entry = regenTracker.get(sessionId) || { timestamps: [], lockoutUntil: null };
    entry.timestamps.push(now);

    const recent = entry.timestamps.filter(t => t > now - REGEN_WINDOW_MS);
    entry.timestamps = recent;

    if (recent.length >= REGEN_MAX) {
      entry.lockoutUntil = now + REGEN_LOCKOUT_MS;
      regenTracker.set(sessionId, entry);
      return { lockedOut: true, lockoutUntil: entry.lockoutUntil, remaining: 0 };
    }

    regenTracker.set(sessionId, entry);
    return { lockedOut: false, lockoutUntil: null, remaining: REGEN_MAX - recent.length };
  }

  app.post("/api/captcha/regenerate", async (req, res) => {
    try {
      const { planId, challengeId } = req.body;
      if (!planId || !challengeId) {
        return res.status(400).json({ message: "Missing fields" });
      }

      const sessionId = req.sessionID || "anon";
      const regenState = getRegenState(sessionId);

      if (!regenState.allowed) {
        const lockoutRemaining = Math.ceil((regenState.lockoutUntil! - Date.now()) / 1000);
        return res.status(429).json({
          message: "Too many regeneration requests. Please wait before trying again.",
          lockedOut: true,
          lockoutRemainingSeconds: Math.max(0, lockoutRemaining),
        });
      }

      const plan = await storage.getCaptchaPlan(planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.isCompleted) return res.status(400).json({ message: "Plan already completed" });
      if (new Date() > plan.expiresAt) return res.status(400).json({ message: "Plan expired" });

      const challenge = await storage.getCaptchaChallenge(challengeId);
      if (!challenge) return res.status(404).json({ message: "Challenge not found" });
      if (challenge.planId !== planId) return res.status(400).json({ message: "Challenge mismatch" });
      if (challenge.isSolved) return res.status(400).json({ message: "Already solved" });

      if (challenge.engineType !== "svg_text" && challenge.engineType !== "math") {
        return res.status(400).json({ message: "This challenge type cannot be regenerated" });
      }

      const newChallengeResult = generateChallenge(challenge.engineType as EngineType, plan.difficulty);

      await storage.updateCaptchaChallenge(challengeId, {
        challengeData: newChallengeResult.challengeData,
        hashedAnswer: newChallengeResult.hashedAnswer,
      });

      const regenResult = recordRegen(sessionId);

      if (regenResult.lockedOut) {
        const lockoutRemaining = Math.ceil((regenResult.lockoutUntil! - Date.now()) / 1000);
        return res.json({
          challengeId,
          engineType: challenge.engineType,
          data: JSON.parse(newChallengeResult.challengeData),
          regenerationsRemaining: 0,
          lockedOut: true,
          lockoutRemainingSeconds: Math.max(0, lockoutRemaining),
        });
      }

      res.json({
        challengeId,
        engineType: challenge.engineType,
        data: JSON.parse(newChallengeResult.challengeData),
        regenerationsRemaining: regenResult.remaining,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const failTracker = new Map<string, { timestamps: number[]; lockoutUntil: number | null }>();
  const FAIL_MAX = 5;
  const FAIL_WINDOW_MS = 5 * 60 * 1000;
  const FAIL_LOCKOUT_MS = 5 * 60 * 1000;

  function getFailState(sessionId: string): { allowed: boolean; lockoutUntil: number | null } {
    const now = Date.now();
    const entry = failTracker.get(sessionId) || { timestamps: [], lockoutUntil: null };

    if (entry.lockoutUntil && now < entry.lockoutUntil) {
      return { allowed: false, lockoutUntil: entry.lockoutUntil };
    }

    if (entry.lockoutUntil && now >= entry.lockoutUntil) {
      entry.lockoutUntil = null;
      entry.timestamps = [];
      failTracker.set(sessionId, entry);
    }

    return { allowed: true, lockoutUntil: null };
  }

  function recordFailure(sessionId: string): { lockedOut: boolean; lockoutUntil: number | null } {
    const now = Date.now();
    const entry = failTracker.get(sessionId) || { timestamps: [], lockoutUntil: null };
    entry.timestamps.push(now);

    const recent = entry.timestamps.filter(t => t > now - FAIL_WINDOW_MS);
    entry.timestamps = recent;

    if (recent.length >= FAIL_MAX) {
      entry.lockoutUntil = now + FAIL_LOCKOUT_MS;
      failTracker.set(sessionId, entry);
      return { lockedOut: true, lockoutUntil: entry.lockoutUntil };
    }

    failTracker.set(sessionId, entry);
    return { lockedOut: false, lockoutUntil: null };
  }

  function clearFailures(sessionId: string) {
    failTracker.delete(sessionId);
  }

  app.post("/api/captcha/solve", async (req, res) => {
    try {
      const { planId, challengeId, answer } = req.body;
      if (!planId || !challengeId || answer === undefined) {
        return res.status(400).json({ message: "Missing fields" });
      }

      const sessionId = req.sessionID || "anon";
      const failState = getFailState(sessionId);
      if (!failState.allowed) {
        const lockoutRemaining = Math.ceil((failState.lockoutUntil! - Date.now()) / 1000);
        return res.status(429).json({
          message: "Too many failed attempts. Please wait before trying again.",
          lockedOut: true,
          lockoutRemainingSeconds: Math.max(0, lockoutRemaining),
        });
      }

      const plan = await storage.getCaptchaPlan(planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.isCompleted) return res.status(400).json({ message: "Plan already completed" });
      if (new Date() > plan.expiresAt) return res.status(400).json({ message: "Plan expired" });

      const challenge = await storage.getCaptchaChallenge(challengeId);
      if (!challenge) return res.status(404).json({ message: "Challenge not found" });
      if (challenge.planId !== planId) return res.status(400).json({ message: "Challenge mismatch" });
      if (challenge.isSolved) return res.status(400).json({ message: "Already solved" });

      let correct = false;
      if (challenge.engineType === "pow_a" || challenge.engineType === "pow_b") {
        correct = verifyPoW(challenge.challengeData, answer);
      } else if (challenge.hashedAnswer) {
        correct = verifyHashedAnswer(challenge.hashedAnswer, answer);
      }

      if (!correct) {
        const failResult = recordFailure(sessionId);
        if (failResult.lockedOut) {
          const lockoutRemaining = Math.ceil((failResult.lockoutUntil! - Date.now()) / 1000);
          return res.status(429).json({
            correct: false,
            message: "Too many failed attempts. Please wait before trying again.",
            lockedOut: true,
            lockoutRemainingSeconds: Math.max(0, lockoutRemaining),
          });
        }
        return res.json({ correct: false });
      }

      clearFailures(sessionId);

      await storage.updateCaptchaChallenge(challengeId, { isSolved: true });
      const newCompleted = plan.completedCount + 1;
      const planCompleted = newCompleted >= plan.requiredCount;

      await storage.updateCaptchaPlan(planId, {
        completedCount: newCompleted,
        isCompleted: planCompleted,
      });

      if (planCompleted) {
        if (plan.planType === "preauth") {
          req.session.completedPreauthPlanId = planId;
        }
        return res.json({ correct: true, planCompleted: true });
      }

      const sequence = getEngineSequence(plan.planType, plan.requiredCount);
      const nextEngineType = sequence[newCompleted % sequence.length] as EngineType;
      const nextChallengeResult = generateChallenge(nextEngineType, plan.difficulty);

      const nextChallenge = await storage.createCaptchaChallenge({
        planId: plan.id,
        engineType: nextChallengeResult.engineType,
        stepIndex: newCompleted,
        challengeData: nextChallengeResult.challengeData,
        hashedAnswer: nextChallengeResult.hashedAnswer,
      });

      res.json({
        correct: true,
        planCompleted: false,
        nextChallenge: {
          planId: plan.id,
          challengeId: nextChallenge.id,
          engineType: nextChallenge.engineType,
          stepIndex: newCompleted,
          totalSteps: plan.requiredCount,
          completedSteps: newCompleted,
          data: JSON.parse(nextChallenge.challengeData),
          difficulty: plan.difficulty,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
  setInterval(async () => {
    try {
      const count = await storage.cleanupExpiredCaptchas();
      if (count > 0) {
        console.log(`[captcha-cleanup] Evicted ${count} expired captcha plans and their challenges`);
      }
    } catch (err) {
      console.error("[captcha-cleanup] Error during cleanup:", err);
    }
  }, CLEANUP_INTERVAL_MS);

  storage.cleanupExpiredCaptchas().then(count => {
    if (count > 0) console.log(`[captcha-cleanup] Startup eviction: removed ${count} expired plans`);
  }).catch(err => {
    console.error("[captcha-cleanup] Startup cleanup error:", err);
  });

  return httpServer;
}

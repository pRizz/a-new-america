import type { EngineType } from "./engines";
import { captchaConfig } from "./config";

export interface PlanConfig {
  requiredCount: number;
  difficulty: number;
  planType: "preauth" | "vote" | "submit";
}

function getPreAuthEngineSequence(): EngineType[] {
  return ["pow_a", "svg_text", "math", "pow_b"];
}

function getVoteEngineSequence(count: number): EngineType[] {
  const required: EngineType[] = ["pow_a", "svg_text", "math"];
  const remaining = count - required.length;
  const pool: EngineType[] = ["pow_b", "pow_a", "svg_text", "math"];
  const sequence = [...required];
  for (let i = 0; i < remaining; i++) {
    sequence.push(pool[i % pool.length]);
  }
  return shuffleWithConstraints(sequence);
}

function getSubmitEngineSequence(count: number): EngineType[] {
  const sequence: EngineType[] = [];
  for (let i = 0; i < 5; i++) sequence.push(i % 2 === 0 ? "pow_a" : "pow_b");
  for (let i = 0; i < 5; i++) sequence.push("svg_text");
  for (let i = 0; i < 3; i++) sequence.push("math");
  const remaining = count - sequence.length;
  const pool: EngineType[] = ["pow_a", "pow_b", "svg_text", "math"];
  for (let i = 0; i < remaining; i++) {
    sequence.push(pool[i % pool.length]);
  }
  return shuffleWithConstraints(sequence);
}

function shuffleWithConstraints(arr: EngineType[]): EngineType[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === arr[i - 1]) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[j] !== arr[i]) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
          break;
        }
      }
    }
  }
  return arr;
}

export function getEngineSequence(planType: string, count: number): EngineType[] {
  switch (planType) {
    case "preauth": return getPreAuthEngineSequence();
    case "vote": return getVoteEngineSequence(count);
    case "submit": return getSubmitEngineSequence(count);
    case "delete": return getVoteEngineSequence(count);
    case "registration": return getPreAuthEngineSequence();
    default: return getVoteEngineSequence(count);
  }
}

export function computeVoteRequirements(captchaDifficulty: number, captchaDebt: number) {
  const { voteBaseCount, voteDebtCountDivisor, voteDebtDifficultyDivisor } = captchaConfig;
  const voteRequiredCount = Math.max(voteBaseCount, voteBaseCount + Math.floor(captchaDebt / voteDebtCountDivisor));
  const voteDifficulty = Math.min(100, Math.max(0, captchaDifficulty + Math.floor(captchaDebt / voteDebtDifficultyDivisor)));
  return { voteRequiredCount, voteDifficulty };
}

export function computeSubmitRequirements(
  captchaDifficulty: number,
  captchaDebt: number,
  globalMinDifficulty: number,
  globalMinCount: number
) {
  const { submitBaseCount, submitDebtCountDivisor, submitDebtDifficultyDivisor } = captchaConfig;
  const submitRequiredCount = Math.max(globalMinCount, submitBaseCount + Math.floor(captchaDebt / submitDebtCountDivisor));
  const userDifficulty = Math.min(100, Math.max(0, captchaDifficulty + Math.floor(captchaDebt / submitDebtDifficultyDivisor)));
  const submitDifficulty = Math.max(globalMinDifficulty, userDifficulty);
  return { submitRequiredCount, submitDifficulty };
}

export function applyDecay(captchaDifficulty: number, captchaDebt: number, lastDecayAt: Date | null): {
  captchaDifficulty: number;
  captchaDebt: number;
  decayPeriods: number;
} {
  if (!lastDecayAt) return { captchaDifficulty, captchaDebt, decayPeriods: 0 };
  const { decayPeriodDays, decayDebtReduction, decayDifficultyReduction, decayDifficultyFloor } = captchaConfig;
  const now = Date.now();
  const elapsed = now - lastDecayAt.getTime();
  const periodMs = decayPeriodDays * 24 * 60 * 60 * 1000;
  const periods = Math.floor(elapsed / periodMs);
  if (periods <= 0) return { captchaDifficulty, captchaDebt, decayPeriods: 0 };

  for (let i = 0; i < periods; i++) {
    captchaDebt = Math.max(0, captchaDebt - decayDebtReduction);
    captchaDifficulty = Math.max(decayDifficultyFloor, captchaDifficulty - decayDifficultyReduction);
  }
  return { captchaDifficulty, captchaDebt, decayPeriods: periods };
}

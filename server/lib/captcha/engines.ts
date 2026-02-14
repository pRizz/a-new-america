import svgCaptcha from "svg-captcha";
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { captchaConfig } from "./config";

export type EngineType = "pow_a" | "pow_b" | "svg_text" | "math";

export interface ChallengeResult {
  engineType: EngineType;
  challengeData: string;
  hashedAnswer: string | null;
}

function difficultyToLength(difficulty: number): number {
  const { svgTextLengthThresholds, svgTextLengths } = captchaConfig;
  for (let i = 0; i < svgTextLengthThresholds.length; i++) {
    if (difficulty < svgTextLengthThresholds[i]) return svgTextLengths[i];
  }
  return svgTextLengths[svgTextLengths.length - 1];
}

function difficultyToPoWTarget(difficulty: number): number {
  const { powTargetThresholds, powTargets } = captchaConfig;
  for (let i = 0; i < powTargetThresholds.length; i++) {
    if (difficulty < powTargetThresholds[i]) return powTargets[i];
  }
  return powTargets[powTargets.length - 1];
}

export function generatePowA(difficulty: number): ChallengeResult {
  const prefix = randomBytes(8).toString("hex");
  const targetLen = difficultyToPoWTarget(difficulty);
  const target = "0".repeat(targetLen);
  return {
    engineType: "pow_a",
    challengeData: JSON.stringify({ prefix, target, type: "find_nonce" }),
    hashedAnswer: null,
  };
}

export function generatePowB(difficulty: number): ChallengeResult {
  const salt = randomBytes(12).toString("hex");
  const targetLen = difficultyToPoWTarget(difficulty);
  const target = "0".repeat(targetLen);
  return {
    engineType: "pow_b",
    challengeData: JSON.stringify({ prefix: salt, target, type: "hash_prefix" }),
    hashedAnswer: null,
  };
}

export function generateSvgText(difficulty: number): ChallengeResult {
  const size = difficultyToLength(difficulty);
  const { svgTextNoiseDivisor, svgTextNoiseMax } = captchaConfig;
  const noise = Math.min(svgTextNoiseMax, Math.floor(difficulty / svgTextNoiseDivisor));
  const captcha = svgCaptcha.create({
    size,
    noise,
    width: 280,
    height: 90,
    color: true,
    background: "#f5f5f5",
    charPreset: "abcdefghjkmnpqrstuvwxyz23456789",
  });
  const hashedAnswer = bcrypt.hashSync(captcha.text.toLowerCase(), 10);
  return {
    engineType: "svg_text",
    challengeData: JSON.stringify({ svg: captcha.data }),
    hashedAnswer,
  };
}

export function generateMath(difficulty: number): ChallengeResult {
  const { mathNoiseDivisor, mathNoiseMin, mathNoiseMax, mathThresholds, mathTiers } = captchaConfig;
  const noise = Math.max(mathNoiseMin, Math.min(mathNoiseMax, Math.floor(difficulty / mathNoiseDivisor)));
  let tier = mathTiers.length - 1;
  for (let i = 0; i < mathThresholds.length; i++) {
    if (difficulty < mathThresholds[i]) {
      tier = i;
      break;
    }
  }
  const { min: mathMin, max: mathMax, op: mathOperator } = mathTiers[tier];

  const captcha = svgCaptcha.createMathExpr({
    noise,
    width: 200,
    height: 80,
    color: true,
    background: "#f5f5f5",
    mathMin,
    mathMax,
    mathOperator,
  });

  const hashedAnswer = bcrypt.hashSync(captcha.text.toString(), 10);
  return {
    engineType: "math",
    challengeData: JSON.stringify({ svg: captcha.data }),
    hashedAnswer,
  };
}

export function generateChallenge(engineType: EngineType, difficulty: number): ChallengeResult {
  switch (engineType) {
    case "pow_a": return generatePowA(difficulty);
    case "pow_b": return generatePowB(difficulty);
    case "svg_text": return generateSvgText(difficulty);
    case "math": return generateMath(difficulty);
  }
}

export function verifyPoW(challengeData: string, answer: string): boolean {
  try {
    const { prefix, target } = JSON.parse(challengeData);
    const attempt = `${prefix}${answer}`;
    const hexHash = createHash("sha256").update(attempt).digest("hex");
    return hexHash.startsWith(target);
  } catch {
    return false;
  }
}

export function verifyHashedAnswer(hashedAnswer: string, userAnswer: string): boolean {
  return bcrypt.compareSync(userAnswer.toLowerCase().trim(), hashedAnswer);
}

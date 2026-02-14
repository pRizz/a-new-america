/**
 * Central captcha configuration. All values default to current behavior.
 * Override via CAPTCHA_* env vars for deployment tuning.
 */

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

const DEFAULTS = {
  // Engine: difficulty -> PoW target (leading zeros)
  powTargetThresholds: [30, 60, 90] as const,
  powTargets: [2, 3, 4, 5] as const,

  // Engine: difficulty -> svg_text length
  svgTextLengthThresholds: [50, 70, 85] as const,
  svgTextLengths: [3, 4, 5, 6] as const,

  // Engine: svg_text noise
  svgTextNoiseDivisor: 20,
  svgTextNoiseMax: 5,

  // Engine: math captcha
  mathThresholds: [40, 60] as const,
  mathTiers: [
    { min: 1, max: 20, op: "+" },
    { min: 5, max: 30, op: "+-" },
    { min: 10, max: 50, op: "+-" },
  ] as const,
  mathNoiseDivisor: 12,
  mathNoiseMin: 1,
  mathNoiseMax: 8,

  // Plan-type defaults
  preauthRequiredCount: 4,
  preauthDifficulty: 80,
  deleteRequiredCount: 2,
  deleteDifficulty: 75,
  defaultRequiredCount: 4,
  defaultDifficulty: 80,

  // Vote/submit formulas
  voteBaseCount: 4,
  voteDebtCountDivisor: 30,
  voteDebtDifficultyDivisor: 25,
  submitBaseCount: 15,
  submitDebtCountDivisor: 20,
  submitDebtDifficultyDivisor: 15,

  // Decay
  decayPeriodDays: 3,
  decayDebtReduction: 15,
  decayDifficultyReduction: 2,
  decayDifficultyFloor: 60,

  // Submit increment caps
  submitMaxGlobalDifficulty: 95,
  submitDifficultyIncrement: 2,
  submitCountIncrementPeriod: 25,
  submitMaxGlobalCount: 25,
  submitDefaultDisplayDifficulty: 85,

  // User defaults
  defaultUserCaptchaDifficulty: 75,
} as const;

export const captchaConfig = {
  powTargetThresholds: DEFAULTS.powTargetThresholds,
  powTargets: DEFAULTS.powTargets,
  svgTextLengthThresholds: DEFAULTS.svgTextLengthThresholds,
  svgTextLengths: DEFAULTS.svgTextLengths,
  svgTextNoiseDivisor: envInt("CAPTCHA_SVG_TEXT_NOISE_DIVISOR", DEFAULTS.svgTextNoiseDivisor),
  svgTextNoiseMax: envInt("CAPTCHA_SVG_TEXT_NOISE_MAX", DEFAULTS.svgTextNoiseMax),
  mathThresholds: DEFAULTS.mathThresholds,
  mathTiers: DEFAULTS.mathTiers,
  mathNoiseDivisor: envInt("CAPTCHA_MATH_NOISE_DIVISOR", DEFAULTS.mathNoiseDivisor),
  mathNoiseMin: envInt("CAPTCHA_MATH_NOISE_MIN", DEFAULTS.mathNoiseMin),
  mathNoiseMax: envInt("CAPTCHA_MATH_NOISE_MAX", DEFAULTS.mathNoiseMax),
  preauthRequiredCount: envInt("CAPTCHA_PREAUTH_REQUIRED_COUNT", DEFAULTS.preauthRequiredCount),
  preauthDifficulty: envInt("CAPTCHA_PREAUTH_DIFFICULTY", DEFAULTS.preauthDifficulty),
  deleteRequiredCount: envInt("CAPTCHA_DELETE_REQUIRED_COUNT", DEFAULTS.deleteRequiredCount),
  deleteDifficulty: envInt("CAPTCHA_DELETE_DIFFICULTY", DEFAULTS.deleteDifficulty),
  defaultRequiredCount: envInt("CAPTCHA_DEFAULT_REQUIRED_COUNT", DEFAULTS.defaultRequiredCount),
  defaultDifficulty: envInt("CAPTCHA_DEFAULT_DIFFICULTY", DEFAULTS.defaultDifficulty),
  voteBaseCount: envInt("CAPTCHA_VOTE_BASE_COUNT", DEFAULTS.voteBaseCount),
  voteDebtCountDivisor: envInt("CAPTCHA_VOTE_DEBT_COUNT_DIVISOR", DEFAULTS.voteDebtCountDivisor),
  voteDebtDifficultyDivisor: envInt("CAPTCHA_VOTE_DEBT_DIFFICULTY_DIVISOR", DEFAULTS.voteDebtDifficultyDivisor),
  submitBaseCount: envInt("CAPTCHA_SUBMIT_BASE_COUNT", DEFAULTS.submitBaseCount),
  submitDebtCountDivisor: envInt("CAPTCHA_SUBMIT_DEBT_COUNT_DIVISOR", DEFAULTS.submitDebtCountDivisor),
  submitDebtDifficultyDivisor: envInt("CAPTCHA_SUBMIT_DEBT_DIFFICULTY_DIVISOR", DEFAULTS.submitDebtDifficultyDivisor),
  decayPeriodDays: envInt("CAPTCHA_DECAY_PERIOD_DAYS", DEFAULTS.decayPeriodDays),
  decayDebtReduction: envInt("CAPTCHA_DECAY_DEBT_REDUCTION", DEFAULTS.decayDebtReduction),
  decayDifficultyReduction: envInt("CAPTCHA_DECAY_DIFFICULTY_REDUCTION", DEFAULTS.decayDifficultyReduction),
  decayDifficultyFloor: envInt("CAPTCHA_DECAY_DIFFICULTY_FLOOR", DEFAULTS.decayDifficultyFloor),
  submitMaxGlobalDifficulty: envInt("CAPTCHA_SUBMIT_MAX_GLOBAL_DIFFICULTY", DEFAULTS.submitMaxGlobalDifficulty),
  submitDifficultyIncrement: envInt("CAPTCHA_SUBMIT_DIFFICULTY_INCREMENT", DEFAULTS.submitDifficultyIncrement),
  submitCountIncrementPeriod: envInt("CAPTCHA_SUBMIT_COUNT_INCREMENT_PERIOD", DEFAULTS.submitCountIncrementPeriod),
  submitMaxGlobalCount: envInt("CAPTCHA_SUBMIT_MAX_GLOBAL_COUNT", DEFAULTS.submitMaxGlobalCount),
  submitDefaultDisplayDifficulty: envInt("CAPTCHA_SUBMIT_DEFAULT_DISPLAY_DIFFICULTY", DEFAULTS.submitDefaultDisplayDifficulty),
  defaultUserCaptchaDifficulty: envInt("CAPTCHA_DEFAULT_USER_DIFFICULTY", DEFAULTS.defaultUserCaptchaDifficulty),
} as const;

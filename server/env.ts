export function requireSessionSecret(): string {
  const sessionSecret = process.env.SESSION_SECRET;

  if (!sessionSecret || sessionSecret.trim().length === 0) {
    throw new Error(
      "SESSION_SECRET is required. Set SESSION_SECRET in the environment and restart.",
    );
  }

  return sessionSecret;
}

import { Strategy, StrategyConfigError } from "./strategy.mjs";

export async function createResolver({ strategies, env = process.env } = {}) {
  if (!Array.isArray(strategies) || strategies.length === 0) {
    throw new TypeError("createResolver requires a non-empty `strategies` array");
  }
  for (const s of strategies) {
    if (!(s instanceof Strategy)) {
      throw new TypeError(`chain entry ${s?.constructor?.name ?? typeof s} is not a Strategy`);
    }
  }

  const isDev = env.NODE_ENV === "development" || env.APP_ENV === "development";
  if (isDev) {
    const { SystemEnvStrategy } = await import("./strategies/system-env.mjs");
    if (strategies.some((s) => s instanceof SystemEnvStrategy)) {
      throw new StrategyConfigError(
        "SystemEnvStrategy is disabled in development. " +
          "Use KeychainBiometricStrategy locally to enforce the biometric gate.",
      );
    }
  }

  return {
    async resolve(key) {
      for (const s of strategies) {
        const v = await s.get(key);
        if (v !== null) return v;
      }
      return null;
    },
  };
}

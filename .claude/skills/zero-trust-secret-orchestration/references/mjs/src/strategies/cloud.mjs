import { Strategy, SecretResolutionError, StrategyConfigError } from "../strategy.mjs";

export class CloudSecretStrategy extends Strategy {
  /**
   * Concrete subclasses implement `_fetch(key)`. Throwing from `_fetch`
   * propagates as a SecretResolutionError; returning `null` continues
   * the chain.
   */
  async _fetch(_key) {
    throw new Error("CloudSecretStrategy._fetch must be implemented by a subclass");
  }

  async get(key) {
    try {
      return await this._fetch(key);
    } catch (err) {
      if (err instanceof StrategyConfigError) throw err;
      throw new SecretResolutionError(`cloud fetch failed for ${key}`, { cause: err });
    }
  }
}

export class AwsSecretsManagerStrategy extends CloudSecretStrategy {
  constructor({ client } = {}) {
    super();
    this.client = client;
  }

  async _fetch(key) {
    if (!this.client) {
      throw new StrategyConfigError(
        "AwsSecretsManagerStrategy is a stub. Inject `{ client: smClient }` " +
          "from `@aws-sdk/client-secrets-manager` to activate it.",
      );
    }
    const out = await this.client.send({ SecretId: key });
    return out.SecretString ?? null;
  }
}

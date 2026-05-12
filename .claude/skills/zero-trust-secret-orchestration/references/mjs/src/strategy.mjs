export class Strategy {
  /**
   * Resolve a secret value by key. Concrete strategies override this.
   *
   * Return contract:
   *   - `null`   : "I don't have this key" — resolver continues the chain.
   *   - throw    : "I had it but resolution failed" — resolver STOPS here.
   *
   * @param {string} key
   * @returns {Promise<string | null>}
   */
  async get(key) {
    throw new Error(`${this.constructor.name}.get(key) is not implemented`);
  }
}

export class SecretResolutionError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = "SecretResolutionError";
    if (cause !== undefined) this.cause = cause;
  }
}

export class StrategyConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "StrategyConfigError";
  }
}

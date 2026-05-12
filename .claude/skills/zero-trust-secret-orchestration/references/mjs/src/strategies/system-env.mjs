import { Strategy } from "../strategy.mjs";

export class SystemEnvStrategy extends Strategy {
  async get(key) {
    const v = process.env[key];
    return v === undefined || v === "" ? null : v;
  }
}

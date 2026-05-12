import fp from "fastify-plugin";
import { createResolver } from "./resolver.mjs";

async function ztsPlugin(fastify, opts) {
  const resolver = await createResolver({
    strategies: opts.strategies,
    env: opts.env ?? process.env,
  });
  fastify.decorate("secrets", resolver);
  fastify.log.info(
    { chain: opts.strategies.map((s) => s.constructor.name) },
    "zts: resolver attached",
  );
}

export default fp(ztsPlugin, {
  name: "zero-trust-secrets",
  fastify: "4.x || 5.x",
});

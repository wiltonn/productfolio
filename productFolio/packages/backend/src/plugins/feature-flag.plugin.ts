import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NotFoundError } from '../lib/errors.js';
import { isEnabled } from '../services/feature-flag.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireFeature: (
      flagKey: string
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function featureFlagPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorate(
    'requireFeature',
    function (flagKey: string) {
      return async function (_request: FastifyRequest, _reply: FastifyReply) {
        const enabled = await isEnabled(flagKey);
        if (!enabled) {
          throw new NotFoundError('Resource');
        }
      };
    }
  );
}

export default fp(featureFlagPlugin, {
  name: 'feature-flag',
});

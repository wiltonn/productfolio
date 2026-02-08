import { FastifyInstance } from 'fastify';
import { PRICING_CONTENT } from '../lib/pricing-content.js';

export async function pricingRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /public/pricing — no auth required
  fastify.get('/public/pricing', async (_request, reply) => {
    return reply.send(PRICING_CONTENT);
  });
}

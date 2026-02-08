import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreatePolicySchema,
  UpdatePolicySchema,
  CreateRequestSchema,
  DecisionSchema,
  RequestListFiltersSchema,
  InboxFiltersSchema,
  PreviewChainSchema,
  CreateDelegationSchema,
  AuditQuerySchema,
} from '../schemas/approval.schema.js';
import * as policyService from '../services/approval-policy.service.js';
import * as workflowService from '../services/approval-workflow.service.js';
import * as auditService from '../services/audit.service.js';

// ============================================================================
// Approval Routes
// ============================================================================

export async function approvalRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  const adminOnly = fastify.requirePermission('approval:write');
  const requireDecisionSeat = fastify.requireSeat('decision');

  // =========================================================================
  // Approval Policies (ADMIN)
  // =========================================================================

  // GET /api/org/nodes/:id/policies — List policies for a node
  fastify.get<{ Params: { id: string } }>(
    '/api/org/nodes/:id/policies',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const policies = await policyService.listPoliciesForNode(id);
      return reply.status(200).send(policies);
    },
  );

  // POST /api/org/nodes/:id/policies — Create policy (ADMIN)
  fastify.post<{ Params: { id: string } }>(
    '/api/org/nodes/:id/policies',
    { preHandler: [adminOnly, requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = CreatePolicySchema.parse(request.body);
      const policy = await policyService.createPolicy(
        { ...body, orgNodeId: id },
        request.user.sub,
      );
      return reply.status(201).send(policy);
    },
  );

  // PUT /api/approval-policies/:id — Update policy (ADMIN)
  fastify.put<{ Params: { id: string } }>(
    '/api/approval-policies/:id',
    { preHandler: [adminOnly, requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const data = UpdatePolicySchema.parse(request.body);
      const policy = await policyService.updatePolicy(id, data, request.user.sub);
      return reply.status(200).send(policy);
    },
  );

  // DELETE /api/approval-policies/:id — Deactivate policy (ADMIN)
  fastify.delete<{ Params: { id: string } }>(
    '/api/approval-policies/:id',
    { preHandler: [adminOnly, requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await policyService.deletePolicy(id, request.user.sub);
      return reply.status(200).send(result);
    },
  );

  // POST /api/approval-policies/preview — Preview approval chain
  fastify.post(
    '/api/approval-policies/preview',
    { preHandler: [requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = PreviewChainSchema.parse(request.body);
      const chain = await policyService.previewChain(data);
      return reply.status(200).send({ chain });
    },
  );

  // =========================================================================
  // Approval Requests
  // =========================================================================

  // GET /api/approval-requests — List requests
  fastify.get(
    '/api/approval-requests',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filters = RequestListFiltersSchema.parse(request.query);
      const result = await workflowService.listApprovalRequests(filters);
      return reply.status(200).send(result);
    },
  );

  // GET /api/approval-requests/inbox — Approver's pending queue
  fastify.get(
    '/api/approval-requests/inbox',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filters = InboxFiltersSchema.parse(request.query);
      const result = await workflowService.getApproverInbox(
        request.user.sub,
        filters,
      );
      return reply.status(200).send(result);
    },
  );

  // GET /api/approval-requests/my — Requester's own requests
  fastify.get(
    '/api/approval-requests/my',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filters = RequestListFiltersSchema.parse(request.query);
      const result = await workflowService.getMyRequests(
        request.user.sub,
        filters,
      );
      return reply.status(200).send(result);
    },
  );

  // GET /api/approval-requests/:id — Get single request
  fastify.get<{ Params: { id: string } }>(
    '/api/approval-requests/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const req = await workflowService.getApprovalRequest(id);
      return reply.status(200).send(req);
    },
  );

  // POST /api/approval-requests — Create request
  fastify.post(
    '/api/approval-requests',
    { preHandler: [requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = CreateRequestSchema.parse(request.body);
      const req = await workflowService.createApprovalRequest(
        { ...data, requesterId: request.user.sub },
        request.user.sub,
      );
      return reply.status(201).send(req);
    },
  );

  // POST /api/approval-requests/:id/decide — Submit decision
  fastify.post<{ Params: { id: string } }>(
    '/api/approval-requests/:id/decide',
    { preHandler: [requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const data = DecisionSchema.parse(request.body);
      const result = await workflowService.submitDecision(
        { requestId: id, deciderId: request.user.sub, ...data },
        request.user.sub,
      );
      return reply.status(200).send(result);
    },
  );

  // POST /api/approval-requests/:id/cancel — Cancel request
  fastify.post<{ Params: { id: string } }>(
    '/api/approval-requests/:id/cancel',
    { preHandler: [requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await workflowService.cancelRequest(id, request.user.sub);
      return reply.status(200).send(result);
    },
  );

  // =========================================================================
  // Delegations
  // =========================================================================

  // GET /api/delegations — List active delegations
  fastify.get(
    '/api/delegations',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const delegations = await workflowService.listActiveDelegations({
        delegateId: request.user.sub,
      });
      return reply.status(200).send(delegations);
    },
  );

  // POST /api/delegations — Create delegation
  fastify.post(
    '/api/delegations',
    { preHandler: [requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = CreateDelegationSchema.parse(request.body);
      // Users without approval:write can only create delegations for themselves
      if (!request.user.permissions.includes('approval:write') && data.delegatorId !== request.user.sub) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'You can only create delegations for yourself',
          statusCode: 403,
        });
      }
      const delegation = await workflowService.createDelegation(
        data,
        request.user.sub,
      );
      return reply.status(201).send(delegation);
    },
  );

  // DELETE /api/delegations/:id — Revoke delegation
  fastify.delete<{ Params: { id: string } }>(
    '/api/delegations/:id',
    { preHandler: [requireDecisionSeat] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await workflowService.revokeDelegation(id, request.user.sub);
      return reply.status(200).send(result);
    },
  );

  // =========================================================================
  // Audit Log (ADMIN)
  // =========================================================================

  // GET /api/audit — Query audit events
  fastify.get(
    '/api/audit',
    { preHandler: adminOnly },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filters = AuditQuerySchema.parse(request.query);
      const result = await auditService.queryAuditEvents(filters);
      return reply.status(200).send(result);
    },
  );
}

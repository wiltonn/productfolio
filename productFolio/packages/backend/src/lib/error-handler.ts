import { FastifyInstance, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import {
  NotFoundError,
  ValidationError,
  WorkflowError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from './errors.js';

interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const response: ErrorResponse = {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      statusCode: 500,
    };

    // Handle Zod validation errors (Zod v4 uses .issues, v3 uses .errors)
    if (error instanceof ZodError) {
      response.error = 'Validation Error';
      response.message = 'Request validation failed';
      response.statusCode = 400;
      const issues = (error as any).issues || (error as any).errors || [];
      response.details = issues.map((e: any) => ({
        path: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
        message: e.message,
      }));
      return reply.status(400).send(response);
    }

    // Handle custom errors
    if (error instanceof NotFoundError) {
      response.error = 'Not Found';
      response.message = error.message;
      response.statusCode = 404;
      return reply.status(404).send(response);
    }

    if (error instanceof ValidationError) {
      response.error = 'Validation Error';
      response.message = error.message;
      response.statusCode = 400;
      if (error.details) {
        response.details = error.details;
      }
      return reply.status(400).send(response);
    }

    if (error instanceof WorkflowError) {
      response.error = 'Workflow Error';
      response.message = error.message;
      response.statusCode = 422;
      response.details = {
        currentStatus: error.currentStatus,
        attemptedStatus: error.attemptedStatus,
      };
      return reply.status(422).send(response);
    }

    if (error instanceof ConflictError) {
      response.error = 'Conflict';
      response.message = error.message;
      response.statusCode = 409;
      return reply.status(409).send(response);
    }

    if (error instanceof UnauthorizedError) {
      response.error = 'Unauthorized';
      response.message = error.message;
      response.statusCode = 401;
      return reply.status(401).send(response);
    }

    if (error instanceof ForbiddenError) {
      response.error = 'Forbidden';
      response.message = error.message;
      response.statusCode = 403;
      return reply.status(403).send(response);
    }

    // Handle Fastify errors (e.g., validation errors from schemas)
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      response.statusCode = error.statusCode;
      response.message = error.message;
      if (error.statusCode === 400) {
        response.error = 'Bad Request';
      } else if (error.statusCode === 404) {
        response.error = 'Not Found';
      }
      return reply.status(error.statusCode).send(response);
    }

    // Log unexpected errors
    fastify.log.error(error);

    return reply.status(500).send(response);
  });
}

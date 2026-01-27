export class NotFoundError extends Error {
  public statusCode = 404;

  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id '${id}' not found` : `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  public statusCode = 400;
  public details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class WorkflowError extends Error {
  public statusCode = 422;
  public currentStatus?: string;
  public attemptedStatus?: string;

  constructor(message: string, currentStatus?: string, attemptedStatus?: string) {
    super(message);
    this.name = 'WorkflowError';
    this.currentStatus = currentStatus;
    this.attemptedStatus = attemptedStatus;
  }
}

export class ConflictError extends Error {
  public statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends Error {
  public statusCode = 401;

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  public statusCode = 403;

  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

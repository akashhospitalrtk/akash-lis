export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'REQUEST_REJECTED',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message = 'Record not found.') { return new AppError(message, 404, 'NOT_FOUND'); }
  static conflict(message: string) { return new AppError(message, 409, 'CONFLICT'); }
  static unauthorized(message = 'Sign in is required.') { return new AppError(message, 401, 'UNAUTHORIZED'); }
  static forbidden(message = 'You do not have permission for this action.') { return new AppError(message, 403, 'FORBIDDEN'); }
}

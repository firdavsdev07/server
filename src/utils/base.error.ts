import { ErrorCode } from "../enums/error-code.enum";

class BaseError extends Error {
  status: number;
  errors: any[];
  errorCode?: string;

  constructor(status: number, message: string, errors: any[] = [], errorCode?: ErrorCode) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.errorCode = errorCode;
    this.name = this.constructor.name;
  }

  static BadRequest(message: string, errors: any[] = [], errorCode?: ErrorCode) {
    return new BaseError(400, message, errors, errorCode);
  }

  static UnauthorizedError(message = "Foydalanuvchiga ruxsat berilmagan", errorCode?: ErrorCode) {
    return new BaseError(401, message, [], errorCode);
  }

  static ForbiddenError(message = "Ruxsat berilmagan", errorCode?: ErrorCode) {
    return new BaseError(403, message, [], errorCode);
  }

  static NotFoundError(message: string, errorCode?: ErrorCode) {
    return new BaseError(404, message, [], errorCode);
  }

  static ConflictError(message: string, errorCode?: ErrorCode) {
    return new BaseError(409, message, [], errorCode);
  }

  static TooManyRequests(message: string) {
    return new BaseError(429, message);
  }

  static InternalServerError(message: string): Error {
    return new Error(`500 Internal Server Error: ${message}`);
  }
}

export default BaseError;

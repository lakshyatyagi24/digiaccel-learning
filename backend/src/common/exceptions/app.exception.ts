import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export class NotFoundException extends AppException {
  constructor(code: string, message: string) {
    super(code, message, HttpStatus.NOT_FOUND);
  }
}

export class ForbiddenException extends AppException {
  constructor(code: string, message: string) {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}

export class ConflictException extends AppException {
  constructor(code: string, message: string) {
    super(code, message, HttpStatus.CONFLICT);
  }
}

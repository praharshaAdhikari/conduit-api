import { HttpException, HttpStatus } from '@nestjs/common';

export type ErrorFields = Record<string, string[]>;

// Every error the API returns has the body { "errors": { "<field>": ["<message>"] } }.
export class ApiError extends HttpException {
  constructor(status: HttpStatus, errors: ErrorFields) {
    super({ errors }, status);
  }
}

export const notFound = (what: string) =>
  new ApiError(HttpStatus.NOT_FOUND, { [what]: ['not found'] });

export const forbidden = (what: string) =>
  new ApiError(HttpStatus.FORBIDDEN, { [what]: ['forbidden'] });

export const alreadyTaken = (field: string) =>
  new ApiError(HttpStatus.CONFLICT, { [field]: ['has already been taken'] });

export const invalid = (errors: ErrorFields) =>
  new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, errors);

export const unauthorized = (message: string) =>
  new ApiError(HttpStatus.UNAUTHORIZED, { token: [message] });

export const suspended = () =>
  new ApiError(HttpStatus.FORBIDDEN, { account: ['is suspended'] });

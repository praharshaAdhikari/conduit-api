import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from './auth.guard';

/** The id of the user making the request, or undefined for an anonymous one. */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): number | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().userId,
);

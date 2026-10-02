import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { unauthorized } from '../common/api-error';
import { TokenService } from './token.service';

export interface AuthenticatedRequest extends Request {
  userId?: number;
}

// "Authorization: Token <jwt>" is what the RealWorld spec uses; "Bearer" is
// accepted as well.
export function tokenFromHeader(header: string | undefined): string | null {
  const match = /^(?:Token|Bearer) (\S+)$/.exec(header ?? '');
  return match ? match[1] : null;
}

/** Rejects the request with 401 unless it carries a valid token. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = tokenFromHeader(request.headers.authorization);
    if (!token) throw unauthorized('is missing');

    const userId = this.tokens.verify(token);
    if (userId === null) throw unauthorized('is invalid');

    request.userId = userId;
    return true;
  }
}

/** Lets everyone in; a valid token only identifies who is asking. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = tokenFromHeader(request.headers.authorization);
    const userId = token ? this.tokens.verify(token) : null;
    if (userId !== null) request.userId = userId;
    return true;
  }
}

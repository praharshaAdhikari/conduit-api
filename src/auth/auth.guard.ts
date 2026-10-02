import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { suspended, unauthorized } from '../common/api-error';
import { User } from '../user/user.entity';
import { TokenService } from './token.service';

export interface AuthenticatedRequest extends Request {
  userId?: number;
  user?: User;
}

// "Authorization: Token <jwt>" is what the RealWorld spec uses; "Bearer" is
// accepted as well.
export function tokenFromHeader(header: string | undefined): string | null {
  const match = /^(?:Token|Bearer) (\S+)$/.exec(header ?? '');
  return match ? match[1] : null;
}

// Both guards read the account on every request, so a suspension or a change
// of role applies at once instead of when the token expires.

/** Rejects the request with 401 unless it carries a valid token, and with 403 if the account is suspended. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = tokenFromHeader(request.headers.authorization);
    if (!token) throw unauthorized('is missing');

    const userId = this.tokens.verify(token);
    const user =
      userId === null ? null : await this.users.findOneBy({ id: userId });
    if (!user) throw unauthorized('is invalid');
    if (user.suspendedAt !== null) throw suspended();

    request.userId = user.id;
    request.user = user;
    return true;
  }
}

/** Lets everyone in; a valid token only identifies who is asking. A suspended account counts as anonymous. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = tokenFromHeader(request.headers.authorization);
    const userId = token ? this.tokens.verify(token) : null;
    const user =
      userId === null ? null : await this.users.findOneBy({ id: userId });
    if (user && user.suspendedAt === null) {
      request.userId = user.id;
      request.user = user;
    }
    return true;
  }
}

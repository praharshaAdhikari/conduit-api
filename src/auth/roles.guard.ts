import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { forbidden } from '../common/api-error';
import { AuthenticatedRequest } from './auth.guard';
import { hasRole, REQUIRED_ROLE, Role } from './roles';

/** Rejects the request with 403 unless the user has the role in @Roles(). Runs after AuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // A role on the method wins over the one on its controller.
    const required = this.reflector.getAllAndOverride<Role | undefined>(
      REQUIRED_ROLE,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !hasRole(user.role, required)) throw forbidden('role');
    return true;
  }
}

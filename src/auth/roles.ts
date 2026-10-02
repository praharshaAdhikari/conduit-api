import { SetMetadata } from '@nestjs/common';

// In order of rank: each role can do everything the ones before it can.
export const ROLES = ['user', 'moderator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export function hasRole(role: Role, required: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(required);
}

export const REQUIRED_ROLE = 'requiredRole';

/** The lowest role allowed to call a route; checked by RolesGuard. */
export const Roles = (role: Role) => SetMetadata(REQUIRED_ROLE, role);

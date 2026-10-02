import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface TokenPayload {
  sub: number;
}

interface GuestPayload {
  guest: string;
}

export const GUEST_TOKEN_EXPIRES_IN = '30m';

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(userId: number): string {
    return this.jwt.sign({ sub: userId } satisfies TokenPayload);
  }

  /** The user id the token was issued to, or null if it is invalid or expired. */
  verify(token: string): number | null {
    try {
      const payload = this.jwt.verify<TokenPayload>(token);
      return typeof payload.sub === 'number' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  /**
   * A short-lived token saying its holder proved they own `email`. It is not
   * a login: it has no user id, so verify() rejects it.
   */
  signGuest(email: string): string {
    return this.jwt.sign({ guest: email } satisfies GuestPayload, {
      expiresIn: GUEST_TOKEN_EXPIRES_IN,
    });
  }

  /** The email a guest token was issued for, or null if it is invalid or expired. */
  verifyGuest(token: string | undefined): string | null {
    if (!token) return null;
    try {
      const payload = this.jwt.verify<GuestPayload>(token);
      return typeof payload.guest === 'string' ? payload.guest : null;
    } catch {
      return null;
    }
  }
}

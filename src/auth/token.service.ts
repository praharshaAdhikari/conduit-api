import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface TokenPayload {
  sub: number;
}

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
}

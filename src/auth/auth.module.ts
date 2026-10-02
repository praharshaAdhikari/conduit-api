import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { jwtSettings } from '../config/env';
import { AuthGuard, OptionalAuthGuard } from './auth.guard';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const { secret, expiresIn } = jwtSettings();
        return {
          secret,
          signOptions: { expiresIn: expiresIn as StringValue },
        };
      },
    }),
  ],
  providers: [TokenService, AuthGuard, OptionalAuthGuard],
  exports: [TokenService, AuthGuard, OptionalAuthGuard],
})
export class AuthModule {}

import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { StringValue } from 'ms';
import { jwtSettings } from '../config/env';
import { User } from '../user/user.entity';
import { AuthGuard, OptionalAuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    // The guards look the account up on every request.
    TypeOrmModule.forFeature([User]),
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
  providers: [TokenService, AuthGuard, OptionalAuthGuard, RolesGuard],
  // TypeOrmModule goes out too: a guard is built in the module that uses it.
  exports: [
    TokenService,
    AuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    TypeOrmModule,
  ],
})
export class AuthModule {}

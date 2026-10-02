import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Not, Repository } from 'typeorm';
import { TokenService } from '../auth/token.service';
import { alreadyTaken, ApiError, unauthorized } from '../common/api-error';
import { LoginDto, RegisterDto, UpdateUserDto, UserResponse } from './user.dto';
import { User } from './user.entity';

/** An empty or missing value clears an optional profile field. */
export function emptyToNull(value: string | null): string | null {
  return value === '' ? null : value;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponse> {
    await this.assertNotTaken(dto.username, dto.email);

    const now = new Date();
    const user = await this.users.save(
      this.users.create({
        username: dto.username,
        email: dto.email,
        passwordHash: await argon2.hash(dto.password),
        bio: null,
        image: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    return this.toResponse(user);
  }

  async login(dto: LoginDto): Promise<UserResponse> {
    const user = await this.users.findOneBy({ email: dto.email });
    // One message for both cases, so a caller cannot tell which emails exist.
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, { credentials: ['invalid'] });
    }
    return this.toResponse(user);
  }

  async current(userId: number): Promise<UserResponse> {
    return this.toResponse(await this.getById(userId));
  }

  async update(userId: number, dto: UpdateUserDto): Promise<UserResponse> {
    const user = await this.getById(userId);
    await this.assertNotTaken(dto.username, dto.email, user.id);

    if (dto.username !== undefined) user.username = dto.username;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.password !== undefined) {
      user.passwordHash = await argon2.hash(dto.password);
    }
    if (dto.bio !== undefined) user.bio = emptyToNull(dto.bio);
    if (dto.image !== undefined) user.image = emptyToNull(dto.image);
    user.updatedAt = new Date();

    return this.toResponse(await this.users.save(user));
  }

  /** The user a token belongs to; 401 if the account no longer exists. */
  async getById(userId: number): Promise<User> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw unauthorized('is invalid');
    return user;
  }

  private async assertNotTaken(
    username: string | undefined,
    email: string | undefined,
    exceptUserId?: number,
  ): Promise<void> {
    const others = exceptUserId === undefined ? {} : { id: Not(exceptUserId) };
    if (username && (await this.users.existsBy({ username, ...others }))) {
      throw alreadyTaken('username');
    }
    if (email && (await this.users.existsBy({ email, ...others }))) {
      throw alreadyTaken('email');
    }
  }

  private toResponse(user: User): UserResponse {
    return {
      user: {
        email: user.email,
        token: this.tokens.sign(user.id),
        username: user.username,
        bio: user.bio,
        image: user.image,
      },
    };
  }
}

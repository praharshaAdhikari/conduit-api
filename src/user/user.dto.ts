import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BLANK } from '../common/validation';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const USERNAME_MAX = 64;

const tooShort = `is too short (minimum is ${PASSWORD_MIN} characters)`;
const tooLong = (max: number) => `is too long (maximum is ${max} characters)`;

export class RegisterDto {
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  @MaxLength(USERNAME_MAX, { message: tooLong(USERNAME_MAX) })
  username: string;

  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  @IsEmail({}, { message: 'is invalid' })
  @MaxLength(255, { message: tooLong(255) })
  email: string;

  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  @MinLength(PASSWORD_MIN, { message: tooShort })
  @MaxLength(PASSWORD_MAX, { message: tooLong(PASSWORD_MAX) })
  password: string;
}

export class RegisterRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => RegisterDto)
  user: RegisterDto;
}

export class LoginDto {
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  email: string;

  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  password: string;
}

export class LoginRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => LoginDto)
  user: LoginDto;
}

// Every field is optional. A field that is sent must be valid: email, username
// and password cannot be null or empty; bio and image can be null, and an empty
// string clears them.
export class UpdateUserDto {
  @ValidateIf((dto: UpdateUserDto) => dto.username !== undefined)
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  @MaxLength(USERNAME_MAX, { message: tooLong(USERNAME_MAX) })
  username?: string;

  @ValidateIf((dto: UpdateUserDto) => dto.email !== undefined)
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  @IsEmail({}, { message: 'is invalid' })
  @MaxLength(255, { message: tooLong(255) })
  email?: string;

  @ValidateIf((dto: UpdateUserDto) => dto.password !== undefined)
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  @MinLength(PASSWORD_MIN, { message: tooShort })
  @MaxLength(PASSWORD_MAX, { message: tooLong(PASSWORD_MAX) })
  password?: string;

  @ValidateIf((dto: UpdateUserDto) => dto.bio != null)
  @IsString({ message: 'must be text' })
  bio?: string | null;

  @ValidateIf((dto: UpdateUserDto) => dto.image != null)
  @IsString({ message: 'must be text' })
  @MaxLength(2048, { message: tooLong(2048) })
  image?: string | null;
}

export class UpdateUserRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => UpdateUserDto)
  user: UpdateUserDto;
}

export interface UserResponse {
  user: {
    email: string;
    token: string;
    username: string;
    bio: string | null;
    image: string | null;
  };
}

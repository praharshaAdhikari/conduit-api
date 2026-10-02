import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { BLANK } from '../common/validation';
import { Profile } from '../profile/profile.service';

export class CreateCommentDto {
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  body: string;
}

export class CreateCommentRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => CreateCommentDto)
  comment: CreateCommentDto;
}

export interface CommentView {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  body: string;
  author: Profile;
}

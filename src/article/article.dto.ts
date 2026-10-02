import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../common/pagination.dto';
import { BLANK } from '../common/validation';
import { Profile } from '../profile/profile.service';

export const TITLE_MAX = 255;
export const TAG_MAX = 64;

const tooLong = (max: number) => `is too long (maximum is ${max} characters)`;
const tagMessages = {
  list: { message: 'must be a list' },
  text: { each: true, message: 'must contain only text' },
  length: {
    each: true,
    message: `has a tag longer than ${TAG_MAX} characters`,
  },
};

export class CreateArticleDto {
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  @MaxLength(TITLE_MAX, { message: tooLong(TITLE_MAX) })
  title: string;

  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  description: string;

  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  body: string;

  @IsOptional()
  @IsArray(tagMessages.list)
  @IsString(tagMessages.text)
  @MaxLength(TAG_MAX, tagMessages.length)
  tagList?: string[];
}

export class CreateArticleRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => CreateArticleDto)
  article: CreateArticleDto;
}

// Every field is optional, but a field that is sent cannot be null or empty.
// Leaving tagList out keeps the tags; an empty list removes them all.
export class UpdateArticleDto {
  @ValidateIf((dto: UpdateArticleDto) => dto.title !== undefined)
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  @MaxLength(TITLE_MAX, { message: tooLong(TITLE_MAX) })
  title?: string;

  @ValidateIf((dto: UpdateArticleDto) => dto.description !== undefined)
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  description?: string;

  @ValidateIf((dto: UpdateArticleDto) => dto.body !== undefined)
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  body?: string;

  @ValidateIf((dto: UpdateArticleDto) => dto.tagList !== undefined)
  @IsArray(tagMessages.list)
  @IsString(tagMessages.text)
  @MaxLength(TAG_MAX, tagMessages.length)
  tagList?: string[];
}

export class UpdateArticleRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => UpdateArticleDto)
  article: UpdateArticleDto;
}

export class ListArticlesQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  favorited?: string;
}

export interface ArticlePreview {
  slug: string;
  title: string;
  description: string;
  tagList: string[];
  createdAt: Date;
  updatedAt: Date;
  favorited: boolean;
  favoritesCount: number;
  author: Profile;
}

export interface ArticleView extends ArticlePreview {
  body: string;
  // Only the author and moderators can load a hidden article at all.
  hidden: boolean;
  hiddenReason: string | null;
}

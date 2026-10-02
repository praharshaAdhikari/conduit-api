import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'must be a whole number' })
  @Min(1, { message: 'must be at least 1' })
  @Max(MAX_LIMIT, { message: `must be at most ${MAX_LIMIT}` })
  limit: number = DEFAULT_LIMIT;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'must be a whole number' })
  @Min(0, { message: 'must be 0 or more' })
  offset: number = 0;
}

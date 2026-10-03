import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { MAX_PAGE_SIZE } from '../pagination.js';

// The limit is bounded by the server's own maximum, so an out-of-range request fails
// instead of silently getting less.
export class PageQueryDto {
	@IsOptional()
	@IsString()
	cursor?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(MAX_PAGE_SIZE)
	limit?: number;
}

import { PartialType, PickType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';

import { MAX_SLUG_LENGTH, SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '../../../common/slug.js';

const MAX_NAME_LENGTH = 100;
const MAX_LABEL_LENGTH = 100;
const MIN_RATE_LIMIT = 1;
const MAX_RATE_LIMIT = 1_000_000;
// Matches MAX_ROUTES: a consumer can be scoped to at most every route.
const MAX_ROUTE_GRANTS = 500;

export class CreateConsumerDto {
	@IsString()
	@MaxLength(MAX_SLUG_LENGTH)
	@Matches(SLUG_PATTERN, { message: SLUG_PATTERN_MESSAGE })
	slug!: string;

	@IsString()
	@Length(1, MAX_NAME_LENGTH)
	name!: string;

	// Fixed 60 s window, across every route.
	@IsOptional()
	@IsInt()
	@Min(MIN_RATE_LIMIT)
	@Max(MAX_RATE_LIMIT)
	rateLimitPerMinute?: number;

	// Empty or absent = every route.
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(MAX_ROUTE_GRANTS)
	@IsUUID('all', { each: true })
	routeIds?: string[];
}

export class UpdateConsumerDto extends PartialType(PickType(CreateConsumerDto, ['name', 'rateLimitPerMinute'] as const)) {}

export class ConsumerRoutesDto {
	// Empty = every route.
	@IsArray()
	@ArrayMaxSize(MAX_ROUTE_GRANTS)
	@IsUUID('all', { each: true })
	routeIds!: string[];
}

export class IssueApiKeyDto {
	@IsOptional()
	@IsString()
	@MaxLength(MAX_LABEL_LENGTH)
	label?: string;
}

import { PartialType } from '@nestjs/swagger';
import { HttpMethod } from '@prisma/control-plane-client';
import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	Length,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateIf,
} from 'class-validator';

import { MAX_PATH_PREFIX_LENGTH, PATH_PREFIX_PATTERN } from '@pyle/shared/contracts/path-prefix.js';

import { MAX_SLUG_LENGTH, SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '../../../common/slug.js';

const MAX_NAME_LENGTH = 100;
const MIN_RATE_LIMIT = 1;
const MAX_RATE_LIMIT = 100_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;
const HTTP_METHOD_COUNT = Object.keys(HttpMethod).length;
const PATH_PREFIX_MESSAGE = 'pathPrefix must start with "/", have no trailing "/", and use only lowercase letters, digits, "-", "_" and "/"';

export class CreateRouteDto {
	@IsString()
	@Length(1, MAX_NAME_LENGTH)
	name!: string;

	@IsString()
	@MaxLength(MAX_PATH_PREFIX_LENGTH)
	@Matches(PATH_PREFIX_PATTERN, { message: PATH_PREFIX_MESSAGE })
	pathPrefix!: string;

	@IsString()
	@MaxLength(MAX_SLUG_LENGTH)
	@Matches(SLUG_PATTERN, { message: SLUG_PATTERN_MESSAGE })
	serviceSlug!: string;

	// true: "/api/orders/42" reaches the instance as "/42".
	@IsOptional()
	@IsBoolean()
	stripPrefix?: boolean;

	// Empty = every method.
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(HTTP_METHOD_COUNT)
	@IsEnum(HttpMethod, { each: true })
	methods?: HttpMethod[];

	@IsOptional()
	@IsBoolean()
	isAuthRequired?: boolean;

	// Per consumer per minute on this route; null removes the route's own limit.
	@IsOptional()
	@ValidateIf(isPresent)
	@IsInt()
	@Min(MIN_RATE_LIMIT)
	@Max(MAX_RATE_LIMIT)
	rateLimitPerMinute?: number | null;

	// Overrides the service timeout; null goes back to the service's.
	@IsOptional()
	@ValidateIf(isPresent)
	@IsInt()
	@Min(MIN_TIMEOUT_MS)
	@Max(MAX_TIMEOUT_MS)
	timeoutMs?: number | null;
}

export class UpdateRouteDto extends PartialType(CreateRouteDto) {}

function isPresent(_object: object, value: unknown): boolean {
	return value !== null;
}

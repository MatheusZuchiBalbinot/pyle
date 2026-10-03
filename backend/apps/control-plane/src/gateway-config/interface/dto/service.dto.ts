import { OmitType, PartialType } from '@nestjs/swagger';
import { LoadBalancingStrategy, ScalingProfile } from '@prisma/control-plane-client';
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

import { MAX_SLUG_LENGTH, SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '../../../common/slug.js';

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;
const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 5;
const MAX_HEALTH_PATH_LENGTH = 200;
const MIN_HEALTH_INTERVAL_MS = 1000;
const MAX_HEALTH_INTERVAL_MS = 60_000;
const MIN_HEALTH_TIMEOUT_MS = 100;
const MAX_HEALTH_TIMEOUT_MS = 10_000;
const MIN_THRESHOLD = 1;
const MAX_HEALTH_THRESHOLD = 10;
const MAX_CIRCUIT_FAILURES = 100;
const MIN_COOLDOWN_MS = 1000;
const MAX_COOLDOWN_MS = 300_000;
const HEALTH_PATH_PATTERN = /^\/[\w\-./]*$/;

// Only the slug is fixed after creation.
export class CreateServiceDto {
	@IsString()
	@MaxLength(MAX_SLUG_LENGTH)
	@Matches(SLUG_PATTERN, { message: SLUG_PATTERN_MESSAGE })
	slug!: string;

	@IsString()
	@Length(1, MAX_NAME_LENGTH)
	name!: string;

	@IsOptional()
	@IsString()
	@MaxLength(MAX_DESCRIPTION_LENGTH)
	description?: string;

	@IsOptional()
	@IsEnum(LoadBalancingStrategy)
	lbStrategy?: LoadBalancingStrategy;

	// The demo image managed replicas run; null = scaled by hand only.
	@IsOptional()
	@IsEnum(ScalingProfile)
	scalingProfile?: ScalingProfile | null;

	// Per attempt.
	@IsOptional()
	@IsInt()
	@Min(MIN_TIMEOUT_MS)
	@Max(MAX_TIMEOUT_MS)
	timeoutMs?: number;

	// Total attempts; 1 disables retries.
	@IsOptional()
	@IsInt()
	@Min(MIN_ATTEMPTS)
	@Max(MAX_ATTEMPTS)
	retryMaxAttempts?: number;

	@IsOptional()
	@IsString()
	@MaxLength(MAX_HEALTH_PATH_LENGTH)
	@Matches(HEALTH_PATH_PATTERN, { message: 'healthCheckPath must be a path starting with "/"' })
	healthCheckPath?: string;

	@IsOptional()
	@IsInt()
	@Min(MIN_HEALTH_INTERVAL_MS)
	@Max(MAX_HEALTH_INTERVAL_MS)
	healthCheckIntervalMs?: number;

	@IsOptional()
	@IsInt()
	@Min(MIN_HEALTH_TIMEOUT_MS)
	@Max(MAX_HEALTH_TIMEOUT_MS)
	healthCheckTimeoutMs?: number;

	@IsOptional()
	@IsInt()
	@Min(MIN_THRESHOLD)
	@Max(MAX_HEALTH_THRESHOLD)
	healthyThreshold?: number;

	@IsOptional()
	@IsInt()
	@Min(MIN_THRESHOLD)
	@Max(MAX_HEALTH_THRESHOLD)
	unhealthyThreshold?: number;

	@IsOptional()
	@IsInt()
	@Min(MIN_THRESHOLD)
	@Max(MAX_CIRCUIT_FAILURES)
	circuitFailureThreshold?: number;

	@IsOptional()
	@IsInt()
	@Min(MIN_COOLDOWN_MS)
	@Max(MAX_COOLDOWN_MS)
	circuitCooldownMs?: number;
}

export class UpdateServiceDto extends PartialType(OmitType(CreateServiceDto, ['slug'] as const)) {}

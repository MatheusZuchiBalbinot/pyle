import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

import { MAX_UPSTREAM_URL_LENGTH } from '@pyle/shared/contracts/upstream-url.js';

const MAX_INSTANCE_NAME_LENGTH = 63;
const INSTANCE_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIN_WEIGHT = 1;
const MAX_WEIGHT = 100;

export class CreateInstanceDto {
	@IsString()
	@Length(1, MAX_INSTANCE_NAME_LENGTH)
	@Matches(INSTANCE_NAME_PATTERN, { message: 'name must be lowercase letters, digits, and single hyphens' })
	name!: string;

	// Base URL the gateway forwards to (http/https, no credentials, query or
	// fragment: checked in the service).
	@IsString()
	@MaxLength(MAX_UPSTREAM_URL_LENGTH)
	url!: string;

	// Only weighted_random reads it.
	@IsOptional()
	@IsInt()
	@Min(MIN_WEIGHT)
	@Max(MAX_WEIGHT)
	weight?: number;

	// false drains the instance: no new traffic, health checks keep running.
	@IsOptional()
	@IsBoolean()
	isEnabled?: boolean;
}

export class UpdateInstanceDto extends PartialType(CreateInstanceDto) {}

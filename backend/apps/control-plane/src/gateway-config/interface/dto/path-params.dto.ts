import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { MAX_SLUG_LENGTH, SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '../../../common/slug.js';

// With `forbidNonWhitelisted`, a params DTO must declare every param of
// its route, hence one class per route shape.
export class ServiceInstanceParamsDto {
	@IsString()
	@MaxLength(MAX_SLUG_LENGTH)
	@Matches(SLUG_PATTERN, { message: SLUG_PATTERN_MESSAGE })
	slug!: string;

	@IsUUID()
	instanceId!: string;
}

export class ConsumerKeyParamsDto {
	@IsString()
	@MaxLength(MAX_SLUG_LENGTH)
	@Matches(SLUG_PATTERN, { message: SLUG_PATTERN_MESSAGE })
	slug!: string;

	@IsUUID()
	keyId!: string;
}

import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { MAX_SLUG_LENGTH, SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '../slug.js';

// Path params go through ValidationPipe only when bound as a class: a bare
// `@Param('id')` reached Prisma unchecked. With `forbidNonWhitelisted` a DTO
// must declare every param of its route, hence one class per param shape.

export class SlugParamDto {
	@IsString()
	@MaxLength(MAX_SLUG_LENGTH)
	@Matches(SLUG_PATTERN, { message: SLUG_PATTERN_MESSAGE })
	slug!: string;
}

export class UuidParamDto {
	@IsUUID()
	id!: string;
}

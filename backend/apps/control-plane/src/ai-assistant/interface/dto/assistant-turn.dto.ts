import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsTimeZone, MaxLength, MinLength, ValidateNested } from 'class-validator';

const MESSAGE_ROLES = ['user', 'assistant'] as const;
// The whole conversation is resent every turn, so its length bounds a turn's cost.
const MAX_ASSISTANT_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 8000;

class AssistantMessageDto {
	@IsIn(MESSAGE_ROLES)
	role!: (typeof MESSAGE_ROLES)[number];

	@IsString()
	@MinLength(1)
	@MaxLength(MAX_MESSAGE_LENGTH)
	content!: string;
}

export class AssistantTurnDto {
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_ASSISTANT_MESSAGES)
	@ValidateNested({ each: true })
	@Type(() => AssistantMessageDto)
	messages!: AssistantMessageDto[];

	// The operator's IANA time zone (from the browser); UTC when absent.
	@IsOptional()
	@IsTimeZone()
	timeZone?: string;
}

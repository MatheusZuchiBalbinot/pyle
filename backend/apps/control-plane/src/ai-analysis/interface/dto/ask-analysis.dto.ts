import { IsString, MaxLength, MinLength } from 'class-validator';

const MAX_QUESTION_LENGTH = 2000;

export class AskAnalysisDto {
	@IsString()
	@MinLength(1)
	@MaxLength(MAX_QUESTION_LENGTH)
	question!: string;
}

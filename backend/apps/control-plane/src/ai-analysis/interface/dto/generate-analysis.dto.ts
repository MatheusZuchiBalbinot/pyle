import type { AiAnalysisScope } from '@prisma/control-plane-client';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { ANALYSIS_SCOPES } from '../../domain/analysis-scope.js';

const MIN_WINDOW_MINUTES = 5;
const MAX_WINDOW_MINUTES = 7 * 24 * 60;

export class GenerateAnalysisDto {
	@IsIn(ANALYSIS_SCOPES)
	scope!: AiAnalysisScope;

	// Required unless platform; checked in the service, where the scope is known.
	@IsOptional()
	@IsUUID()
	subjectId?: string;

	@IsOptional()
	@IsInt()
	@Min(MIN_WINDOW_MINUTES)
	@Max(MAX_WINDOW_MINUTES)
	windowMinutes?: number;
}

export class ListAnalysesQueryDto extends PageQueryDto {
	@IsOptional()
	@IsIn(ANALYSIS_SCOPES)
	scope?: AiAnalysisScope;

	@IsOptional()
	@IsUUID()
	subjectId?: string;
}

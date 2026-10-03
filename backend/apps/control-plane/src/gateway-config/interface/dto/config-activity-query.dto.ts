import { ConfigEntityType } from '@prisma/control-plane-client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PageQueryDto } from '../../../common/dto/page-query.dto.js';

export class ConfigActivityQueryDto extends PageQueryDto {
	@IsOptional()
	@IsEnum(ConfigEntityType)
	entityType?: ConfigEntityType;

	@IsOptional()
	@IsUUID()
	entityId?: string;
}

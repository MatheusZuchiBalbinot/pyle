import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

import { MAX_SUSTAINED_WINDOWS, MIN_SUSTAINED_WINDOWS } from '../../domain/alert-rule-kinds.js';

// The threshold's range depends on the kind; the service checks it.
export class UpdateAlertRuleConfigDto {
	@IsBoolean()
	isEnabled!: boolean;

	// Null for the instance kinds, which take none. @IsOptional also lets an
	// explicit null through, which is exactly what those need.
	@ApiProperty({ type: Number, nullable: true })
	@IsOptional()
	@IsNumber()
	threshold!: number | null;

	@IsInt()
	@Min(MIN_SUSTAINED_WINDOWS)
	@Max(MAX_SUSTAINED_WINDOWS)
	sustainedWindows!: number;
}

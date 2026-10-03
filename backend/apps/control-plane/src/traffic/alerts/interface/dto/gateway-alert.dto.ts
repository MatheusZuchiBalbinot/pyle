import { ApiProperty } from '@nestjs/swagger';
import type { AlertSeverity, AlertSubjectType, GatewayAlert, GatewayAlertKind } from '@prisma/control-plane-client';

import type { Page } from '../../../../common/pagination.js';

export class GatewayAlertDto {
	readonly id!: string;
	readonly kind!: GatewayAlertKind;
	readonly severity!: AlertSeverity;
	readonly subjectType!: AlertSubjectType;
	readonly subjectId!: string;
	readonly subjectName!: string;
	readonly message!: string;
	readonly triggeredAt!: string;
	readonly resolvedAt!: string | null;
}

export class GatewayAlertPageDto implements Page<GatewayAlertDto> {
	@ApiProperty({ type: [GatewayAlertDto] })
	readonly items!: readonly GatewayAlertDto[];
	// Null on the last page.
	readonly nextCursor!: string | null;
}

export function toGatewayAlertDto(alert: GatewayAlert, subjectName: string): GatewayAlertDto {
	return {
		id: alert.id,
		kind: alert.kind,
		severity: alert.severity,
		subjectType: alert.subjectType,
		subjectId: alert.subjectId,
		subjectName,
		message: alert.message,
		triggeredAt: alert.triggeredAt.toISOString(),
		resolvedAt: alert.resolvedAt?.toISOString() ?? null,
	};
}

import { ApiProperty } from '@nestjs/swagger';

import type { RealtimeConnection } from '../../application/realtime-token.service.js';

export class RealtimeConnectionDto implements RealtimeConnection {
	readonly token!: string;
	// The Centrifugo WebSocket endpoint to connect to.
	readonly url!: string;
	@ApiProperty({ type: [String] })
	readonly channels!: readonly string[];
	readonly expiresAt!: string;
}

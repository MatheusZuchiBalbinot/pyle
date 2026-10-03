import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { getAdminCaller, type AdminCaller } from '../../auth/interface/admin-caller.js';
import type { ConfigActor } from '../application/config-change-recorder.js';

// The service token (scripts, the seeder) has no e-mail to record.
export function toConfigActor(caller: AdminCaller | undefined): ConfigActor {
	if (caller?.kind === 'user') {
		return { email: caller.email };
	}

	return { email: null };
}

function readConfigActor(_data: unknown, context: ExecutionContext): ConfigActor {
	const request = context.switchToHttp().getRequest<Request>();

	return toConfigActor(getAdminCaller(request));
}

export const CurrentConfigActor = createParamDecorator(readConfigActor);

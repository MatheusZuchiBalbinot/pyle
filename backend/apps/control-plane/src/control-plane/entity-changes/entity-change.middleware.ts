import type { Prisma } from '@prisma/control-plane-client';

import type { EntityChangeBus } from './entity-change-bus.service.js';
import { extractEntityId, toEntityChangeAction } from './entity-change.js';

// Prisma's $use is deprecated in favour of $extends, but it is the only hook that keeps the
// same client instance.
export function createEntityChangeMiddleware(bus: EntityChangeBus): Prisma.Middleware {
	return async (params, next) => {
		const result: unknown = await next(params);
		const action = toEntityChangeAction(params.action);
		const isModelWrite = params.model !== undefined && action !== null;

		if (!isModelWrite) {
			return result;
		}

		const model = params.model!;

		bus.emit({ model, action, id: extractEntityId(params.args, result) });

		return result;
	};
}

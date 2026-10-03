import type { GatewayConfigSnapshot } from '@pyle/shared/contracts/config-snapshot.js';

import { RouteTable } from '../routing/route-table.js';

// Swapped as a whole: a request reads the old or the new configuration, never a mix.
export class ConfigStore {
	private table: RouteTable | null = null;

	current(): RouteTable | null {
		return this.table;
	}

	replace(snapshot: GatewayConfigSnapshot): RouteTable {
		const table = new RouteTable(snapshot);

		this.table = table;

		return table;
	}
}

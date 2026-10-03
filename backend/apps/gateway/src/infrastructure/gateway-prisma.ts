import { PrismaClient } from '@prisma/control-plane-client';

// The data plane reads configuration and writes traffic samples; it needs
// few connections. Kept small so N gateways do not exhaust Postgres.
const GATEWAY_CONNECTION_LIMIT = 5;
const CONNECTION_LIMIT_PARAM = 'connection_limit';

export function withConnectionLimit(databaseUrl: string, limit: number = GATEWAY_CONNECTION_LIMIT): string {
	const url = new URL(databaseUrl);

	if (!url.searchParams.has(CONNECTION_LIMIT_PARAM)) {
		url.searchParams.set(CONNECTION_LIMIT_PARAM, String(limit));
	}

	return url.toString();
}

export function createGatewayPrisma(databaseUrl: string): PrismaClient {
	return new PrismaClient({ datasourceUrl: withConnectionLimit(databaseUrl) });
}

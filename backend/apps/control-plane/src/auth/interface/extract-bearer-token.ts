const BEARER_PREFIX = 'Bearer ';

export function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
	if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
		return undefined;
	}

	return authorizationHeader.slice(BEARER_PREFIX.length).trim() || undefined;
}

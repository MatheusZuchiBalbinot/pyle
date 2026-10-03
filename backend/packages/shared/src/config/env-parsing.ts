export function readRequiredEnv(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

// Absent means the default; present but invalid is an error, never a silent fallback.
export function readPositiveIntEnv(name: string, fallback: number): number {
	const raw = process.env[name];

	if (!raw) {
		return fallback;
	}

	const parsed = Number(raw);
	const isPositiveInteger = Number.isInteger(parsed) && parsed > 0;

	if (!isPositiveInteger) {
		throw new Error(`Environment variable ${name} must be a positive integer (got "${raw}")`);
	}

	return parsed;
}

// Only "true" and "false": a typo must not silently mean false.
export function readBooleanEnv(name: string, fallback: boolean): boolean {
	const raw = process.env[name];

	if (!raw) {
		return fallback;
	}

	if (raw === 'true') {
		return true;
	}

	if (raw === 'false') {
		return false;
	}

	throw new Error(`Environment variable ${name} must be "true" or "false" (got "${raw}")`);
}

// A number in [0, 1], e.g. a sampling rate.
export function readFractionEnv(name: string, fallback: number): number {
	const raw = process.env[name];

	if (!raw) {
		return fallback;
	}

	const parsed = Number(raw);
	const isFraction = raw.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1;

	if (!isFraction) {
		throw new Error(`Environment variable ${name} must be a number between 0 and 1 (got "${raw}")`);
	}

	return parsed;
}

const MAX_TCP_PORT = 65_535;

export function readPortEnv(name: string, fallback: number): number {
	const port = readPositiveIntEnv(name, fallback);

	if (port > MAX_TCP_PORT) {
		throw new Error(`Environment variable ${name} must be a TCP port (1-${MAX_TCP_PORT}, got ${port})`);
	}

	return port;
}

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// Consumer slug → its API keys, in clear. Git-ignored: the seed writes it,
// the load bot reads it.
export type ConsumerKeyManifest = Readonly<Record<string, readonly string[]>>;

export const MANIFEST_FILE_NAME = 'consumer-keys.local.json';

export function readManifest(path: string): ConsumerKeyManifest | null {
	if (!existsSync(path)) {
		return null;
	}

	const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

	if (!isManifest(parsed)) {
		throw new Error(`${path} is not a consumer key manifest; delete it and run the seed again`);
	}

	return parsed;
}

export function writeManifest(path: string, manifest: ConsumerKeyManifest): void {
	writeFileSync(path, `${JSON.stringify(manifest, null, '\t')}\n`, { mode: 0o600 });
}

export function deleteManifest(path: string): void {
	rmSync(path, { force: true });
}

// Keys only exist in clear when a consumer is created: a rerun keeps what
// the previous run wrote, adding the consumers created now.
export function mergeManifests(previous: ConsumerKeyManifest | null, created: ConsumerKeyManifest): ConsumerKeyManifest {
	return { ...previous, ...created };
}

function isManifest(value: unknown): value is ConsumerKeyManifest {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}

	return Object.values(value).every((keys) => Array.isArray(keys) && keys.every((key) => typeof key === 'string'));
}

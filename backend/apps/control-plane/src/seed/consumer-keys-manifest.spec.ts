import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { deleteManifest, mergeManifests, readManifest, writeManifest } from './consumer-keys-manifest.js';

function tempPath(): string {
	return join(mkdtempSync(join(tmpdir(), 'pyle-manifest-')), 'consumer-keys.local.json');
}

describe('consumer key manifest', () => {
	it('writes, reads back and deletes', () => {
		const path = tempPath();
		const manifest = { 'web-app': ['pyle_live_a'], 'mobile-app': ['pyle_live_b', 'pyle_live_c'] };

		expect(readManifest(path)).toBeNull();
		writeManifest(path, manifest);
		expect(readManifest(path)).toEqual(manifest);
		deleteManifest(path);
		expect(readManifest(path)).toBeNull();
	});

	it('refuses a file that is not a manifest', () => {
		const path = tempPath();

		writeFileSync(path, JSON.stringify({ 'web-app': 'not a list' }));

		expect(() => readManifest(path)).toThrow('not a consumer key manifest');
	});

	it('keeps the previous keys and adds the new consumers', () => {
		expect(mergeManifests({ a: ['1'] }, { b: ['2'] })).toEqual({ a: ['1'], b: ['2'] });
		expect(mergeManifests(null, { b: ['2'] })).toEqual({ b: ['2'] });
	});
});

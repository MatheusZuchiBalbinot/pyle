import { describe, expect, it } from 'vitest';

import { PasswordHasher } from './password-hasher.js';

const PASSWORD = 'correct horse battery staple';

describe('PasswordHasher', () => {
	const hasher = new PasswordHasher();

	it('accepts the right password and rejects a wrong one', async () => {
		const hash = await hasher.hash(PASSWORD);

		await expect(hasher.verify(PASSWORD, hash)).resolves.toBe(true);
		await expect(hasher.verify('correct horse battery stapl', hash)).resolves.toBe(false);
		await expect(hasher.verify('', hash)).resolves.toBe(false);
	});

	it('salts every hash, so the same password never encodes the same way', async () => {
		const [first, second] = await Promise.all([hasher.hash(PASSWORD), hasher.hash(PASSWORD)]);

		expect(first).not.toEqual(second);
		await expect(hasher.verify(PASSWORD, second)).resolves.toBe(true);
	});

	it('encodes its own parameters, so the cost can be raised later', async () => {
		const [prefix, cost, blockSize, parallelization, salt, key] = (await hasher.hash(PASSWORD)).split('$');

		expect(prefix).toBe('scrypt');
		expect(Number(cost)).toBe(2 ** 15);
		expect([Number(blockSize), Number(parallelization)]).toEqual([8, 1]);
		expect(Buffer.from(salt, 'base64')).toHaveLength(16);
		expect(Buffer.from(key, 'base64')).toHaveLength(32);
	});

	it('verifies a hash that used different parameters', async () => {
		const hash = await hasher.hash(PASSWORD);
		const [prefix, , blockSize, parallelization, salt, key] = hash.split('$');
		// A row written by an older, cheaper configuration must still work.
		const cheaperHash = [prefix, 2 ** 14, blockSize, parallelization, salt, key].join('$');

		// Same salt but a different cost derives a different key, so this is
		// false — what matters is that it answers instead of throwing.
		await expect(hasher.verify(PASSWORD, cheaperHash)).resolves.toBe(false);
	});

	it.each([
		['empty', ''],
		['not our encoding', 'argon2$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaA'],
		['truncated', 'scrypt$32768$8$1$c2FsdA'],
		['non-numeric parameters', 'scrypt$many$eight$one$c2FsdA$a2V5'],
	])('refuses to authenticate against a %s stored hash', async (_label, storedHash) => {
		await expect(hasher.verify(PASSWORD, storedHash)).resolves.toBe(false);
	});
});

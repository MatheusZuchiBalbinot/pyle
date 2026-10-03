import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { Injectable } from '@nestjs/common';

type ScryptParameters = {
	readonly cost: number;
	readonly blockSize: number;
	readonly parallelization: number;
};

// `promisify(scrypt)` loses the overload that takes options, so the call
// is wrapped by hand instead.
function scryptAsync(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, keyLength, options, (error, derivedKey) => (error ? reject(error) : resolve(derivedKey)));
	});
}

// N = 2^15 (about 32 MiB with r = 8), the OWASP floor.
const SCRYPT_COST = 2 ** 15;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY_BYTES = 256 * 1024 * 1024;
const SALT_LENGTH = 16;
const ENCODING_PREFIX = 'scrypt';
const ENCODED_FIELD_COUNT = 6;

// Node's scrypt, not argon2id: no native module to build. The encoded string carries its
// parameters, so a higher cost later only affects new hashes.
@Injectable()
export class PasswordHasher {
	async hash(password: string): Promise<string> {
		const salt = randomBytes(SALT_LENGTH);
		const parameters: ScryptParameters = { cost: SCRYPT_COST, blockSize: SCRYPT_BLOCK_SIZE, parallelization: SCRYPT_PARALLELIZATION };
		const derivedKey = await this.deriveKey(password, salt, parameters);
		const fields = [
			ENCODING_PREFIX,
			parameters.cost,
			parameters.blockSize,
			parameters.parallelization,
			salt.toString('base64'),
			derivedKey.toString('base64'),
		];

		return fields.join('$');
	}

	// A corrupted stored hash must not be a way in.
	async verify(password: string, encodedHash: string): Promise<boolean> {
		const fields = encodedHash.split('$');

		if (fields.length !== ENCODED_FIELD_COUNT || fields[0] !== ENCODING_PREFIX) {
			return false;
		}

		const [, cost, blockSize, parallelization, salt, expectedKey] = fields;
		const parameters: ScryptParameters = { cost: Number(cost), blockSize: Number(blockSize), parallelization: Number(parallelization) };
		const hasValidParameters = Object.values(parameters).every((value) => Number.isInteger(value) && value > 0);

		if (!hasValidParameters) {
			return false;
		}

		const expected = Buffer.from(expectedKey, 'base64');
		const derivedKey = await this.deriveKey(password, Buffer.from(salt, 'base64'), parameters, expected.length);

		if (derivedKey.length !== expected.length) {
			return false;
		}

		return timingSafeEqual(derivedKey, expected);
	}

	private deriveKey(password: string, salt: Buffer, parameters: ScryptParameters, keyLength: number = SCRYPT_KEY_LENGTH): Promise<Buffer> {
		// The default maxmem sits exactly at what this cost needs, and scrypt throws unless
		// it is comfortably above.
		const options = { N: parameters.cost, r: parameters.blockSize, p: parameters.parallelization, maxmem: SCRYPT_MAX_MEMORY_BYTES };

		return scryptAsync(password, salt, keyLength, options);
	}
}

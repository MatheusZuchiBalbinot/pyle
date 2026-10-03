import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ensureAdminAccount, type AdminAccountDependencies, type EnsuredAdminAccount } from '../application/ensure-admin-account.js';
import { PasswordHasher } from '../application/password-hasher.js';
import { AdminUserRepository } from '../infrastructure/admin-user.repository.js';
import { MIN_PASSWORD_LENGTH } from '../interface/dto/admin-auth.dto.js';
import { AdminCliModule } from './admin-cli.module.js';

const GENERATED_PASSWORD_BYTES = 12;

const USAGE = [
	'Creates (or re-passwords) an operator account for the admin console.',
	'',
	'Usage:',
	'  npm run admin:create -- --email=ops@example.com [--name="Ops"] [--password=...]',
	'',
	'Without --password one is generated and printed once. Env fallbacks:',
	'ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_NAME, ADMIN_BOOTSTRAP_PASSWORD.',
].join('\n');

type AccountInput = {
	readonly email: string;
	readonly name: string;
	readonly password: string;
	readonly isGeneratedPassword: boolean;
};

function readInput(): AccountInput {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: { email: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' }, help: { type: 'boolean' } },
	});

	if (values.help) {
		console.log(USAGE);
		process.exit(0);
	}

	const email = values.email ?? process.env.ADMIN_BOOTSTRAP_EMAIL;

	if (!email) {
		throw new Error(`--email is required.\n\n${USAGE}`);
	}

	const providedPassword = values.password ?? process.env.ADMIN_BOOTSTRAP_PASSWORD;
	const password = providedPassword ?? randomBytes(GENERATED_PASSWORD_BYTES).toString('base64url');

	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters`);
	}

	return { email, name: values.name ?? process.env.ADMIN_BOOTSTRAP_NAME ?? email, password, isGeneratedPassword: providedPassword === undefined };
}

function describeOutcome(account: EnsuredAdminAccount): string {
	if (account.outcome === 'password-reset') {
		return `Password reset for ${account.email}`;
	}

	return `Created operator ${account.email} (${account.id})`;
}

// The first operator cannot be created through the authenticated API. Re-running it resets
// the password (the manual password-reset path).
async function main(): Promise<void> {
	const input = readInput();
	const context = await NestFactory.createApplicationContext(AdminCliModule, { logger: ['log', 'warn', 'error'] });
	const logger = new Logger('admin:create');

	try {
		const dependencies: AdminAccountDependencies = { repository: context.get(AdminUserRepository), hasher: context.get(PasswordHasher) };
		const account = await ensureAdminAccount(dependencies, input);

		logger.log(describeOutcome(account));

		if (input.isGeneratedPassword) {
			logger.log(`Generated password (shown once): ${input.password}`);
		}
	} finally {
		await context.close();
	}
}

main().catch((error: unknown) => {
	console.error(`[admin:create] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});

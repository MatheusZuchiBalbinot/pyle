import type { AdminUserRepository } from '../infrastructure/admin-user.repository.js';
import type { PasswordHasher } from './password-hasher.js';

export type AdminAccountInput = {
	readonly email: string;
	readonly name: string;
	readonly password: string;
};

export type AdminAccountDependencies = {
	readonly repository: AdminUserRepository;
	readonly hasher: PasswordHasher;
};

export type EnsuredAdminAccount = {
	readonly outcome: 'created' | 'password-reset';
	readonly id: string;
	readonly email: string;
};

// Creates the operator, or resets the password of the active account with that address.
// Shared by admin:create and the seeder.
export async function ensureAdminAccount(dependencies: AdminAccountDependencies, input: AdminAccountInput): Promise<EnsuredAdminAccount> {
	const { repository, hasher } = dependencies;
	const passwordHash = await hasher.hash(input.password);
	const existing = await repository.findActiveByEmail(input.email);

	if (existing) {
		await repository.updatePassword(existing.id, passwordHash);

		return { outcome: 'password-reset', id: existing.id, email: existing.email };
	}

	const created = await repository.create({ email: input.email, name: input.name, passwordHash });

	return { outcome: 'created', id: created.id, email: created.email };
}

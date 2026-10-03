export function getTestAdminApiToken(): string {
	return readRequiredEnv('ADMIN_API_TOKEN');
}

function readRequiredEnv(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

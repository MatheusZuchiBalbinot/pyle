export function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return JSON.stringify(error);
}

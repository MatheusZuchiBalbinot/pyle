import { Prisma } from '@prisma/control-plane-client';

const UNIQUE_VIOLATION_CODE = 'P2002';

// The partial unique indexes settle the race two concurrent creates can win; this turns the
// loser into a 409.
export function isUniqueViolation(error: unknown): boolean {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION_CODE;
}

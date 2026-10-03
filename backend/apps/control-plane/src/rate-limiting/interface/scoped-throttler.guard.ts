import { ThrottlerGuard } from '@nestjs/throttler';

// Applies only its own named throttler: by default every ThrottlerGuard would apply every
// bucket.
export abstract class ScopedThrottlerGuard extends ThrottlerGuard {
	protected abstract readonly throttlerName: ThrottlerName;

	override async onModuleInit(): Promise<void> {
		await super.onModuleInit();
		this.throttlers = this.throttlers.filter((throttler) => throttler.name === this.throttlerName);
	}
}

const THROTTLER_NAMES = ['login', 'assistant'] as const;

type ThrottlerName = (typeof THROTTLER_NAMES)[number];

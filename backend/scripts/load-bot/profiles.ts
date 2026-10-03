export const BOT_PROFILE_NAMES = ['steady', 'burst', 'spike', 'abusive', 'chaos', 'mixed'] as const;
export type BotProfileName = (typeof BOT_PROFILE_NAMES)[number];

const BURST_PERIOD_MS = 20_000;
const BURST_LENGTH_MS = 5000;
const BURST_FACTOR = 5;
// One spike cycle: 30 s up to the peak, 30 s back down.
const SPIKE_HALF_CYCLE_MS = 30_000;
const SPIKE_PEAK_FACTOR = 10;
// The mixed profile's wave: one smooth cycle every 10 min, swinging this
// share of the mean either way (550 req/s goes from about 300 to 800).
const WAVE_PERIOD_MS = 10 * 60_000;
const WAVE_SWING = 0.45;

// partner-x at 50 req/s against its 20 req/s (1200/min) limit.
export const ABUSIVE_RPS = 50;

type TickBudget = { readonly count: number; readonly carry: number };

export function isBotProfileName(value: string): value is BotProfileName {
	return (BOT_PROFILE_NAMES as readonly string[]).includes(value);
}

// Requests per second the profile wants (baseRps is the mean for mixed) at this point of the run.
export function targetRps(profile: BotProfileName, baseRps: number, elapsedMs: number): number {
	if (profile === 'abusive') {
		return ABUSIVE_RPS;
	}

	if (profile === 'spike') {
		return baseRps * spikeFactor(elapsedMs);
	}

	if (profile === 'burst') {
		const isBursting = elapsedMs % BURST_PERIOD_MS < BURST_LENGTH_MS;

		return isBursting ? baseRps * BURST_FACTOR : baseRps;
	}

	if (profile === 'mixed') {
		return baseRps * waveFactor(elapsedMs);
	}

	return baseRps;
}

// Whole requests to send in a tick; the fraction left carries over, so
// 2.5 req/s at 100 ms ticks really sends 2.5 per second.
export function requestsForTick(rps: number, tickMs: number, carry: number): TickBudget {
	const exact = (rps * tickMs) / 1000 + carry;
	const count = Math.floor(exact);

	return { count, carry: exact - count };
}

function spikeFactor(elapsedMs: number): number {
	const inCycle = elapsedMs % (2 * SPIKE_HALF_CYCLE_MS);
	const climb = inCycle <= SPIKE_HALF_CYCLE_MS ? inCycle / SPIKE_HALF_CYCLE_MS : 2 - inCycle / SPIKE_HALF_CYCLE_MS;

	return 1 + (SPIKE_PEAK_FACTOR - 1) * climb;
}

// Starts at the mean, so a fresh bot joins the seeded history without a step.
function waveFactor(elapsedMs: number): number {
	const angle = (2 * Math.PI * elapsedMs) / WAVE_PERIOD_MS;

	return 1 + WAVE_SWING * Math.sin(angle);
}

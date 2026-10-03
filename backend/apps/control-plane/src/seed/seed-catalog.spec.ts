import { describe, expect, it } from 'vitest';

import { DEMO_LIVE_RPS } from './demo-traffic.js';
import { SEED_CONSUMERS, SEED_ROUTES } from './seed-catalog.js';

// The load bot's wave (scripts/load-bot): its mixed profile swings 45% around the mean
// and spreads each route's requests evenly over the consumers allowed on it.
const WAVE_SWING = 0.45;
const PEAK_RPS = DEMO_LIVE_RPS * (1 + WAVE_SWING);
const TROUGH_RPS = DEMO_LIVE_RPS * (1 - WAVE_SWING);
const CONSUMERS_PER_ROUTE = 3;
// Every route but the public one, and the catalog alone (partner-x's only route).
const AUTHENTICATED_SHARE = 0.99;
const CATALOG_SHARE = 0.3;
const PUBLIC_SHARE = 0.01;
const SECONDS_PER_MINUTE = 60;

function limitPerSecond(slug: string): number {
	const consumer = SEED_CONSUMERS.find((candidate) => candidate.slug === slug);

	return (consumer?.rateLimitPerMinute ?? 0) / SECONDS_PER_MINUTE;
}

describe('seed catalog limits', () => {
	it("lets the regular consumers through at the bot's peak", () => {
		const peakPerConsumer = (PEAK_RPS * AUTHENTICATED_SHARE) / CONSUMERS_PER_ROUTE;

		for (const slug of ['web-app', 'mobile-app', 'internal-batch']) {
			expect(limitPerSecond(slug)).toBeGreaterThan(peakPerConsumer);
		}
	});

	it('keeps partner-x over its limit even at the trough', () => {
		const troughPartnerRps = (TROUGH_RPS * CATALOG_SHARE) / CONSUMERS_PER_ROUTE;

		expect(limitPerSecond('partner-x')).toBeLessThan(troughPartnerRps);
	});

	it('keeps every route limit above what one caller sends it at the peak', () => {
		const peakPublicRps = PEAK_RPS * PUBLIC_SHARE;
		const routeLimits = SEED_ROUTES.flatMap((route) => (route.rateLimitPerMinute === null ? [] : [route.rateLimitPerMinute / SECONDS_PER_MINUTE]));

		expect(Math.min(...routeLimits)).toBeGreaterThan(peakPublicRps);
	});
});

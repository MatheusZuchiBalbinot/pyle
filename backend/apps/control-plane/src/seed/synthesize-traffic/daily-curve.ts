import { TRAFFIC_BUCKET_MS } from '@pyle/shared/contracts/latency-histogram.js';

import { MS_PER_SECOND, type Random, type StatusField } from './types.js';

// The daily curve, the noise on top of it, and how a bucket's requests split
// (over instances, consumers, statuses, latency buckets): the generators
// every row builder draws from.

const BUCKET_SECONDS = TRAFFIC_BUCKET_MS / MS_PER_SECOND;

// The daily curve: lowest at 4 h, highest at 14 h (local time), never
// below this share of the peak.
const TROUGH_HOUR = 4;
const PEAK_HOUR = 14;
const CURVE_FLOOR = 0.2;
const NOISE_SPREAD = 0.3;
const SPLIT_NOISE = 0.2;

const CLIENT_ERROR_CHANCE = 0.01;
const SERVER_ERROR_CHANCE = 0.003;
const HTTP_OK = 200;
const HTTP_CLIENT_ERROR = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;

// What the instances answer, and the share of each.
export const ANSWERED_STATUSES: readonly number[] = [HTTP_OK, HTTP_NOT_FOUND, HTTP_SERVER_ERROR];
export const ANSWERED_STATUS_SHARES: readonly number[] = [1 - CLIENT_ERROR_CHANCE - SERVER_ERROR_CHANCE, CLIENT_ERROR_CHANCE, SERVER_ERROR_CHANCE];

// Seeded PRNG (mulberry32): the same seed gives the same history.
export function createSeededRandom(seed: number): Random {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;

		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

// 0 at the trough, 1 at the peak: a cosine stretched so the climb takes
// 10 hours and the fall 14.
export function dailyCurve(hour: number): number {
	const hoursSinceTrough = (hour - TROUGH_HOUR + 24) % 24;
	const risingHours = PEAK_HOUR - TROUGH_HOUR;
	const angle =
		hoursSinceTrough <= risingHours
			? (hoursSinceTrough / risingHours) * Math.PI
			: Math.PI + ((hoursSinceTrough - risingHours) / (24 - risingHours)) * Math.PI;

	return CURVE_FLOOR + (1 - CURVE_FLOOR) * ((1 - Math.cos(angle)) / 2);
}

export function requestsIn(peakRps: number, curve: number, random: Random): number {
	const noise = 1 + (random() - 0.5) * NOISE_SPREAD;

	return Math.max(0, Math.round(peakRps * curve * noise * BUCKET_SECONDS));
}

// Splits a count over weighted parts in whole numbers that add up to it, each weight
// nudged by noise so no two buckets split alike. Counts, not one draw per request:
// a day at the live bot's rate is tens of millions of requests.
export function splitCount(total: number, weights: readonly number[], random: Random): number[] {
	const noisyWeights = weights.map((weight) => weight * (1 + (random() - 0.5) * SPLIT_NOISE));
	const weightSum = noisyWeights.reduce((sum, weight) => sum + weight, 0);

	if (weightSum === 0) {
		return weights.map(() => 0);
	}

	const exact = noisyWeights.map((weight) => (total * weight) / weightSum);
	const parts = exact.map((value) => Math.floor(value));
	const remainder = total - parts.reduce((sum, part) => sum + part, 0);
	// Largest remainder: the parts closest to their next unit get the units left over.
	const byFraction = exact.map((value, index) => ({ index, fraction: value - parts[index] })).sort((left, right) => right.fraction - left.fraction);
	const roundedUp = new Set(byFraction.slice(0, remainder).map((entry) => entry.index));

	return parts.map((part, index) => (roundedUp.has(index) ? part + 1 : part));
}

export function statusFieldOf(status: number): StatusField {
	if (status >= HTTP_SERVER_ERROR) {
		return 'status5xx';
	}

	if (status >= HTTP_CLIENT_ERROR) {
		return 'status4xx';
	}

	return 'status2xx';
}

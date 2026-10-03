import { describe, expect, it } from 'vitest';

import {
	bucketIndexFor,
	emptyHistogram,
	LATENCY_HISTOGRAM_LENGTH,
	mergeHistograms,
	percentileFromHistogram,
	toBucketStart,
	TRAFFIC_BUCKET_MS,
} from './latency-histogram.js';

function histogramWith(counts: Readonly<Record<number, number>>): number[] {
	const histogram = emptyHistogram();

	for (const [index, count] of Object.entries(counts)) {
		histogram[Number(index)] = count;
	}

	return histogram;
}

describe('latency histogram', () => {
	it('has one counter per bound plus the overflow bucket', () => {
		expect(emptyHistogram()).toHaveLength(LATENCY_HISTOGRAM_LENGTH);
		expect(LATENCY_HISTOGRAM_LENGTH).toBe(12);
	});

	it.each([
		[-3, 0],
		[0, 0],
		[5, 0],
		[5.1, 1],
		[99, 4],
		[100, 4],
		[10000, 10],
		[10001, 11],
	])('puts %s ms in bucket %s', (latencyMs, expectedIndex) => {
		expect(bucketIndexFor(latencyMs)).toBe(expectedIndex);
	});

	it('answers null when there is no data', () => {
		expect(percentileFromHistogram(emptyHistogram(), 0.95)).toBeNull();
	});

	it('interpolates inside the bucket that holds the target rank', () => {
		// 100 requests, all between 50 and 100 ms.
		const histogram = histogramWith({ 4: 100 });

		expect(percentileFromHistogram(histogram, 0.5)).toBe(75);
		expect(percentileFromHistogram(histogram, 0.95)).toBe(97.5);
	});

	it('walks the cumulative count across buckets', () => {
		// 90 fast (<=10 ms, bucket 1: 5..10) and 10 slow (bucket 7: 500..1000).
		const histogram = histogramWith({ 1: 90, 7: 10 });

		expect(percentileFromHistogram(histogram, 0.5)).toBe(7.8);
		expect(percentileFromHistogram(histogram, 0.95)).toBe(750);
		expect(percentileFromHistogram(histogram, 0.99)).toBe(950);
	});

	it('answers the last bound when the target falls in the overflow bucket', () => {
		expect(percentileFromHistogram(histogramWith({ 11: 5 }), 0.99)).toBe(10000);
	});

	it('merges histograms element by element', () => {
		const merged = mergeHistograms([histogramWith({ 0: 1, 3: 2 }), histogramWith({ 3: 5, 11: 1 })]);

		expect(merged).toEqual(histogramWith({ 0: 1, 3: 7, 11: 1 }));
	});

	it('gives a different answer than averaging percentiles when volumes differ', () => {
		const busyFastInstance = histogramWith({ 1: 900 });
		const quietSlowInstance = histogramWith({ 8: 100 });
		const merged = mergeHistograms([busyFastInstance, quietSlowInstance]);

		expect(percentileFromHistogram(merged, 0.5)).toBe(7.8);
	});

	it.each([
		[0, 0],
		[9_999, 0],
		[TRAFFIC_BUCKET_MS, TRAFFIC_BUCKET_MS],
		[25_001, 20_000],
	])('floors %s to the bucket start %s', (timestamp, expected) => {
		expect(toBucketStart(timestamp)).toBe(expected);
	});
});

// Merges the unit, feature and e2e coverage reports into one number. The istanbul packages
// ship no types, hence the narrow local ones below.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

type CoverageMapData = Record<string, unknown>;

type CoverageSummary = {
	readonly statements: { readonly pct: number };
	readonly branches: { readonly pct: number };
	readonly functions: { readonly pct: number };
	readonly lines: { readonly pct: number };
};

type CoverageMap = {
	merge(data: CoverageMapData): void;
	getCoverageSummary(): { toJSON(): CoverageSummary };
};

type ReportContext = unknown;

type IstanbulLibCoverage = {
	createCoverageMap(data?: CoverageMapData): CoverageMap;
};

type IstanbulLibReport = {
	createContext(opts: { dir: string; coverageMap: CoverageMap }): ReportContext;
};

type IstanbulReport = { execute(context: ReportContext): void };

type IstanbulReports = {
	create(name: string, opts?: Record<string, unknown>): IstanbulReport;
};

const libCoverage = require('istanbul-lib-coverage') as IstanbulLibCoverage;
const libReport = require('istanbul-lib-report') as IstanbulLibReport;
const reports = require('istanbul-reports') as IstanbulReports;

const TIER_REPORT_DIRS = ['coverage/unit', 'coverage/feature', 'coverage/e2e'] as const;
const MERGED_REPORT_DIR = 'coverage/merged';

// Branches and functions sit lower on purpose: much of what stays uncovered there is
// infrastructure catch blocks and config fallbacks.
type CoverageThresholds = {
	readonly statements: number;
	readonly branches: number;
	readonly functions: number;
	readonly lines: number;
};

// Set just under what the suite actually measures, so an honest small
// change does not turn the build red while a real regression does.
const COVERAGE_THRESHOLDS: CoverageThresholds = {
	statements: 97,
	branches: 90,
	functions: 95,
	lines: 97,
};

function loadTierCoverage(reportsDirectory: string): CoverageMapData | undefined {
	const reportPath = join(reportsDirectory, 'coverage-final.json');

	if (!existsSync(reportPath)) {
		console.warn(`Skipping "${reportsDirectory}" — no coverage-final.json found. Did that tier's test:cov run?`);

		return undefined;
	}

	return JSON.parse(readFileSync(reportPath, 'utf8')) as CoverageMapData;
}

function mergeAllTiers(): CoverageMap {
	const coverageMap = libCoverage.createCoverageMap({});

	for (const reportsDirectory of TIER_REPORT_DIRS) {
		const tierData = loadTierCoverage(reportsDirectory);

		if (tierData) {
			coverageMap.merge(tierData);
		}
	}

	return coverageMap;
}

function printSummaryAndCheckThreshold(coverageMap: CoverageMap): boolean {
	const summary = coverageMap.getCoverageSummary().toJSON();
	const metrics = [
		['Statements', summary.statements.pct, COVERAGE_THRESHOLDS.statements],
		['Branches', summary.branches.pct, COVERAGE_THRESHOLDS.branches],
		['Functions', summary.functions.pct, COVERAGE_THRESHOLDS.functions],
		['Lines', summary.lines.pct, COVERAGE_THRESHOLDS.lines],
	] as const;

	console.log('\n=============== Merged coverage summary (unit + feature + e2e) ===============');

	for (const [label, pct, threshold] of metrics) {
		const status = pct >= threshold ? 'ok  ' : 'FAIL';

		console.log(`${status} ${label.padEnd(11)}: ${pct.toFixed(2)}% (target ${threshold}%)`);
	}

	console.log('=================================================================================\n');

	return metrics.every(([, pct, threshold]) => pct >= threshold);
}

const coverageMap = mergeAllTiers();
const context = libReport.createContext({ dir: MERGED_REPORT_DIR, coverageMap });

reports.create('html').execute(context);
reports.create('json-summary').execute(context);

const isAboveThreshold = printSummaryAndCheckThreshold(coverageMap);

console.log(`Full HTML report: ${MERGED_REPORT_DIR}/index.html`);

if (!isAboveThreshold) {
	console.error('Below target on at least one metric — see the FAIL rows above.');
	process.exit(1);
}

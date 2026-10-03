// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Components take type sizes, radii and motion only from the tokens in theme.css; a raw
// value slipping back in is how the console drifted to 14 font sizes and 12 radii.

type Declaration = { readonly file: string; readonly line: number; readonly property: string; readonly value: string };

type TokenRule = { readonly name: string; readonly appliesTo: (property: string) => boolean; readonly isRaw: (value: string) => boolean };

// Read from disk: under Vitest a CSS import comes back empty. Type-checked with the Node
// config (tsconfig.node.json), not the app's.
const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));
// The one file allowed to hold raw values: it defines the tokens.
const THEME_FILE = join('app', 'theme.css');
const CSS_EXTENSION = '.css';

const DECLARATION_PATTERN = /([a-z-]+)\s*:\s*([^;{}]+);/g;
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
// A non-zero pixel length (0px is as harmless as 0).
const NONZERO_PX_PATTERN = /(?<![\w.-])(?!0+(?:\.0+)?px)\d*\.?\d+px\b/;
// A non-zero time (0s, used to flip visibility at the end of a transition, is fine).
const NONZERO_DURATION_PATTERN = /(?<![\w.-])(?!0+(?:\.0+)?m?s\b)\d*\.?\d+m?s\b/;

const RULES: readonly TokenRule[] = [
	{ name: 'font-size uses a --text-* token', appliesTo: (property) => property === 'font-size', isRaw: (value) => NONZERO_PX_PATTERN.test(value) },
	{ name: 'border radius uses a --radius-* token', appliesTo: isRadiusProperty, isRaw: (value) => NONZERO_PX_PATTERN.test(value) },
	{ name: 'transition uses the --duration-* tokens', appliesTo: isTransitionProperty, isRaw: (value) => NONZERO_DURATION_PATTERN.test(value) },
];

describe('CSS design tokens', () => {
	const declarations = listCssFiles(SOURCE_ROOT)
		.map((file) => relative(SOURCE_ROOT, file))
		.filter((file) => file !== THEME_FILE)
		.flatMap((file) => readDeclarations(file, readFileSync(join(SOURCE_ROOT, file), 'utf8')));

	it('finds the stylesheets it guards', () => {
		expect(declarations.length).toBeGreaterThan(0);
	});

	it.each(RULES)('$name', (rule) => {
		const violations = declarations.filter((declaration) => violates(rule, declaration)).map(describeDeclaration);

		expect(violations).toEqual([]);
	});

	it('flags raw values and accepts tokens', () => {
		const [fontSize, radius, transition] = RULES;

		expect(fontSize.isRaw('12.5px')).toBe(true);
		expect(fontSize.isRaw('var(--text-sm)')).toBe(false);
		expect(radius.isRaw('0 0 var(--radius-lg) 7px')).toBe(true);
		expect(radius.isRaw('50%')).toBe(false);
		expect(radius.isRaw('0px')).toBe(false);
		expect(transition.isRaw('opacity 0.2s ease')).toBe(true);
		expect(transition.isRaw('visibility 0s linear var(--duration-slow)')).toBe(false);
	});
});

function isRadiusProperty(property: string): boolean {
	return property === 'border-radius' || /^border-[a-z]+-[a-z]+-radius$/.test(property);
}

function isTransitionProperty(property: string): boolean {
	return property === 'transition' || property === 'transition-duration' || property === 'transition-delay';
}

function listCssFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) {
			return listCssFiles(path);
		}

		return entry.name.endsWith(CSS_EXTENSION) ? [path] : [];
	});
}

function readDeclarations(file: string, rawSource: string): Declaration[] {
	// Comments are blanked, not removed, so line numbers stay right.
	const source = rawSource.replace(COMMENT_PATTERN, blankKeepingLines);

	return [...source.matchAll(DECLARATION_PATTERN)].map((match) => {
		const line = source.slice(0, match.index).split('\n').length;

		return { file, line, property: match[1], value: match[2].trim() };
	});
}

function blankKeepingLines(comment: string): string {
	return comment.replace(/[^\n]/g, ' ');
}

function violates(rule: TokenRule, declaration: Declaration): boolean {
	return rule.appliesTo(declaration.property) && rule.isRaw(declaration.value);
}

function describeDeclaration(declaration: Declaration): string {
	return `${declaration.file}:${declaration.line} ${declaration.property}: ${declaration.value}`;
}

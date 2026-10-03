import { describe, expect, it } from 'vitest';

import { buildTranslationResource, PT_BR_TRANSLATION, type TranslationTree } from './loadLocale';

const SINGULAR_SUFFIX = '_one';

// Every `x_one` key whose tree has no `x_zero` next to it.
function pluralsWithoutZero(tree: TranslationTree, path: string): readonly string[] {
	return Object.entries(tree).flatMap(([key, value]) => {
		if (typeof value !== 'string') {
			return pluralsWithoutZero(value, `${path}${key}.`);
		}

		if (!key.endsWith(SINGULAR_SUFFIX)) {
			return [];
		}

		const base = key.slice(0, -SINGULAR_SUFFIX.length);

		return `${base}_zero` in tree ? [] : [`${path}${base}`];
	});
}

describe('buildTranslationResource', () => {
	it('keys each file by its namespace', () => {
		const resource = buildTranslationResource({
			'./locales/pt-BR/sidebar.json': { title: 'Menu' },
			'./locales/pt-BR/common.json': { save: 'Salvar' },
		});

		expect(resource).toEqual({ sidebar: { title: 'Menu' }, common: { save: 'Salvar' } });
	});

	it('ignores a path that is not a JSON file', () => {
		expect(buildTranslationResource({ './locales/pt-BR/README': { x: 'y' } })).toEqual({});
	});
});

describe('PT_BR_TRANSLATION', () => {
	it('loads the real namespaces', () => {
		expect(PT_BR_TRANSLATION.common).toMatchObject({ save: 'Salvar' });
	});

	// Portuguese plural rules put 0 in the singular form, so without a zero
	// form a count of 0 reads "1 aberto" or "0 análise".
	it('gives every plural a zero form', () => {
		expect(pluralsWithoutZero(PT_BR_TRANSLATION, '')).toEqual([]);
	});
});

// Every literal key the code asks for (`t('area.key')`), as written in the sources.
const SOURCES = import.meta.glob<string>(['../app/**/*.{ts,tsx}', '!../app/**/*.spec.{ts,tsx}'], { query: '?raw', import: 'default', eager: true });
const LITERAL_KEY_PATTERN = /\bt\(\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g;
const PLURAL_SUFFIXES = ['_zero', '_one', '_other'] as const;

function resolves(tree: TranslationTree, key: string): boolean {
	const path = key.split('.');
	const leafName = path.pop() ?? '';
	const parent = path.reduce<TranslationTree | string | undefined>((node, segment) => (typeof node === 'object' ? node[segment] : undefined), tree);

	if (typeof parent !== 'object') {
		return false;
	}

	const candidates = [leafName, ...PLURAL_SUFFIXES.map((suffix) => `${leafName}${suffix}`)];

	return candidates.some((candidate) => typeof parent[candidate] === 'string');
}

function missingLiteralKeys(): readonly string[] {
	const keys = Object.values(SOURCES).flatMap((source) => [...source.matchAll(LITERAL_KEY_PATTERN)].map((match) => match[1]));

	return [...new Set(keys)].filter((key) => !resolves(PT_BR_TRANSLATION, key)).sort();
}

describe('translation keys in the code', () => {
	// Regression: a key left over from a renamed namespace showed on screen as "nodeDetail.close".
	it('all exist in pt-BR, so no raw key reaches the screen', () => {
		expect(missingLiteralKeys()).toEqual([]);
	});

	it('finds the keys it checks', () => {
		expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
		expect(resolves(PT_BR_TRANSLATION, 'common.save')).toBe(true);
		expect(resolves(PT_BR_TRANSLATION, 'common.missing')).toBe(false);
	});
});

import stylistic from '@stylistic/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';
import tseslint from 'typescript-eslint';

// Layout rules only, the ones Prettier cannot do (it never adds braces or
// blank lines). Correctness is oxlint's job (.oxlintrc.json).
export default tseslint.config(
	{ ignores: ['dist', 'coverage', 'node_modules'] },
	{
		files: ['**/*.ts'],
		languageOptions: { parser: tseslint.parser, parserOptions: { experimentalDecorators: true } },
		plugins: { '@stylistic': stylistic, perfectionist },
		linterOptions: { reportUnusedDisableDirectives: 'error' },
		rules: {
			// Every if has braces, early returns included.
			curly: ['error', 'all'],
			// Early return instead of else after a return.
			'no-else-return': ['error', { allowElseIf: false }],
			'no-lonely-if': 'error',
			// One blank line between the blocks of a function: after the
			// declarations, around every block statement, before the return.
			'@stylistic/padding-line-between-statements': [
				'error',
				{ blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
				{ blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
				{ blankLine: 'always', prev: '*', next: 'block-like' },
				{ blankLine: 'always', prev: 'block-like', next: '*' },
				{ blankLine: 'always', prev: '*', next: 'return' },
				{ blankLine: 'any', prev: ['import', 'export'], next: ['import', 'export'] },
			],
			// Types first, then what the module exports, then its internals.
			'perfectionist/sort-modules': [
				'error',
				{
					type: 'unsorted',
					groups: [
						['declare-enum', 'export-enum', 'enum'],
						['declare-interface', 'declare-type', 'export-interface', 'export-type'],
						['interface', 'type'],
						// Classes keep their own order: unlike functions they are not
						// hoisted, so one used by another must stay above it.
						['declare-class', 'class', 'export-class'],
						'export-function',
						['declare-function', 'function'],
					],
				},
			],
		},
	},
);

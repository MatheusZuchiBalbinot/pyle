import { describe, expect, it } from 'vitest';

import { parseInlineMarkdown } from './inlineMarkdown';

describe('parseInlineMarkdown', () => {
	it('splits bold and code runs out of plain text', () => {
		expect(parseInlineMarkdown('Criar **Loja Azul** (slug `loja-azul`).')).toEqual([
			{ kind: 'text', text: 'Criar ' },
			{ kind: 'bold', text: 'Loja Azul' },
			{ kind: 'text', text: ' (slug ' },
			{ kind: 'code', text: 'loja-azul' },
			{ kind: 'text', text: ').' },
		]);
	});

	// The component parses the bold text again, so the code inside renders.
	it('keeps code inside a bold run for the bold run to parse', () => {
		expect(parseInlineMarkdown('**a `orders-2` b**')).toEqual([{ kind: 'bold', text: 'a `orders-2` b' }]);
	});

	it('leaves unmatched markers and markup as literal text', () => {
		expect(parseInlineMarkdown('2 ** 3 e <b>x</b> e ``')).toEqual([{ kind: 'text', text: '2 ** 3 e <b>x</b> e ``' }]);
	});
});

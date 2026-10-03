import { describe, expect, it } from 'vitest';

import { parseMarkdownBlocks } from './markdownBlocks';

describe('parseMarkdownBlocks', () => {
	it('turns a run of bullet lines into one list between text blocks', () => {
		const text = 'Vejo que:\n\n- **p95**: 33 ms\n- pico às 11:08\n\nÉ normal?';

		expect(parseMarkdownBlocks(text)).toEqual([
			{ kind: 'text', text: 'Vejo que:' },
			{ kind: 'list', isOrdered: false, items: ['**p95**: 33 ms', 'pico às 11:08'] },
			{ kind: 'text', text: 'É normal?' },
		]);
	});

	it('keeps numbered and bulleted runs as separate lists', () => {
		expect(parseMarkdownBlocks('1. drenar\n2) conferir\n- nota')).toEqual([
			{ kind: 'list', isOrdered: true, items: ['drenar', 'conferir'] },
			{ kind: 'list', isOrdered: false, items: ['nota'] },
		]);
	});

	it('leaves prose with line breaks as a single text block', () => {
		expect(parseMarkdownBlocks('linha um\nlinha dois\n\n2 - 1 = 1')).toEqual([{ kind: 'text', text: 'linha um\nlinha dois\n\n2 - 1 = 1' }]);
	});

	it('returns nothing for blank text', () => {
		expect(parseMarkdownBlocks('\n  \n')).toEqual([]);
	});
});

export type MarkdownBlock =
	{ readonly kind: 'text'; readonly text: string } | { readonly kind: 'list'; readonly isOrdered: boolean; readonly items: readonly string[] };

type ListLine = { readonly isOrdered: boolean; readonly item: string };

const BULLET_PATTERN = /^\s*[-*•]\s+(.+)$/;
const NUMBERED_PATTERN = /^\s*\d+[.)]\s+(.+)$/;
const EDGE_NEWLINES_PATTERN = /^\n+|\n+$/g;

// Runs of "- item" or "1. item" lines become lists; everything else stays text, line
// breaks included. Models answer with lists even when asked for prose.
export function parseMarkdownBlocks(text: string): readonly MarkdownBlock[] {
	const blocks: MarkdownBlock[] = [];
	let textLines: string[] = [];

	function flushText(): void {
		const joined = textLines.join('\n').replace(EDGE_NEWLINES_PATTERN, '');

		if (joined.trim().length > 0) {
			blocks.push({ kind: 'text', text: joined });
		}

		textLines = [];
	}

	for (const line of text.split('\n')) {
		const listLine = toListLine(line);

		if (listLine === null) {
			textLines.push(line);
			continue;
		}

		flushText();
		appendListItem(blocks, listLine);
	}

	flushText();

	return blocks;
}

function toListLine(line: string): ListLine | null {
	const bullet = BULLET_PATTERN.exec(line);

	if (bullet !== null) {
		return { isOrdered: false, item: bullet[1] };
	}

	const numbered = NUMBERED_PATTERN.exec(line);

	if (numbered !== null) {
		return { isOrdered: true, item: numbered[1] };
	}

	return null;
}

function appendListItem(blocks: MarkdownBlock[], listLine: ListLine): void {
	const last = blocks.at(-1);
	const continuesList = last?.kind === 'list' && last.isOrdered === listLine.isOrdered;

	if (continuesList) {
		blocks[blocks.length - 1] = { ...last, items: [...last.items, listLine.item] };

		return;
	}

	blocks.push({ kind: 'list', isOrdered: listLine.isOrdered, items: [listLine.item] });
}

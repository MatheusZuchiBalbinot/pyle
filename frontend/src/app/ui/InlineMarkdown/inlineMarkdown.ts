export type InlineSegment = { readonly kind: 'text' | 'bold' | 'code'; readonly text: string };

// **bold** and `code` — the only markdown models keep using in chat even
// when asked for plain text. Anything else stays literal text.
const INLINE_TOKEN_PATTERN = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
const BOLD_MARKER = '**';
const CODE_MARKER = '`';

export function parseInlineMarkdown(text: string): readonly InlineSegment[] {
	return text
		.split(INLINE_TOKEN_PATTERN)
		.filter((part) => part.length > 0)
		.map(toSegment);
}

function toSegment(part: string): InlineSegment {
	const isBold = part.startsWith(BOLD_MARKER) && part.endsWith(BOLD_MARKER) && part.length > BOLD_MARKER.length * 2;

	if (isBold) {
		return { kind: 'bold', text: part.slice(BOLD_MARKER.length, -BOLD_MARKER.length) };
	}

	const isCode = part.startsWith(CODE_MARKER) && part.endsWith(CODE_MARKER) && part.length > CODE_MARKER.length * 2;

	if (isCode) {
		return { kind: 'code', text: part.slice(CODE_MARKER.length, -CODE_MARKER.length) };
	}

	return { kind: 'text', text: part };
}

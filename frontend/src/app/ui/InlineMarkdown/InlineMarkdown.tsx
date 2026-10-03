import type { ReactElement } from 'react';

import { parseInlineMarkdown } from './inlineMarkdown';

import './InlineMarkdown.css';

type InlineMarkdownProps = {
	readonly text: string;
};

// React nodes, never HTML: the text is untrusted.
export function InlineMarkdown({ text }: InlineMarkdownProps): ReactElement {
	const segments = parseInlineMarkdown(text);

	return <>{segments.map((segment, index) => renderSegment(segment, index))}</>;
}

function renderSegment(segment: ReturnType<typeof parseInlineMarkdown>[number], index: number): ReactElement {
	// A bold run may hold `code` (models write **the `orders-2` instance**).
	if (segment.kind === 'bold') {
		return (
			<strong key={index}>
				<InlineMarkdown text={segment.text} />
			</strong>
		);
	}

	if (segment.kind === 'code') {
		return (
			<code key={index} className="inline-markdown-code">
				{segment.text}
			</code>
		);
	}

	return <span key={index}>{segment.text}</span>;
}

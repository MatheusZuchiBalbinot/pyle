import type { ReactElement } from 'react';

import { InlineMarkdown } from '../InlineMarkdown/InlineMarkdown';
import { parseMarkdownBlocks, type MarkdownBlock } from './markdownBlocks';

import './MarkdownText.css';

type MarkdownTextProps = {
	readonly text: string;
};

// Text blocks and lists as React nodes, never HTML: the text is untrusted.
export function MarkdownText({ text }: MarkdownTextProps): ReactElement {
	const blocks = parseMarkdownBlocks(text);

	return <>{blocks.map(renderBlock)}</>;
}

function renderBlock(block: MarkdownBlock, index: number): ReactElement {
	if (block.kind === 'text') {
		return (
			<span key={index} className="markdown-text-block">
				<InlineMarkdown text={block.text} />
			</span>
		);
	}

	const items = block.items.map((item, itemIndex) => (
		<li key={itemIndex}>
			<InlineMarkdown text={item} />
		</li>
	));

	if (block.isOrdered) {
		return (
			<ol key={index} className="markdown-list">
				{items}
			</ol>
		);
	}

	return (
		<ul key={index} className="markdown-list">
			{items}
		</ul>
	);
}

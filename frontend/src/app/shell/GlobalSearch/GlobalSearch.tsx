import { KeyRound, Route as RouteIcon, Search, Server, ServerCog, type LucideIcon } from 'lucide-react';
import { useCallback, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useGateway } from '@/app/core/gateway/useGateway';
import { useCommandShortcut } from '@/app/hooks/useCommandShortcut';
import { useDismissableMenu } from '@/app/hooks/useDismissableMenu';
import { ARROW_DOWN_KEY, ARROW_UP_KEY, ENTER_KEY } from '@/app/lib/keyboardKeys';
import { formatCommandShortcut } from '@/app/lib/platform';
import { Skeleton } from '@/app/ui/Skeleton/Skeleton';
import { TextInput } from '@/app/ui/TextInput/TextInput';

import { useGlobalSearch } from '../hooks/useGlobalSearch';
import type { SearchResult, SearchResultKind } from '../lib/consoleSearch';

import './GlobalSearch.css';

const SEARCH_SHORTCUT_KEY = 'k';
const ICON_SIZE = 14;
const LOADING_ROWS = ['first', 'second', 'third'];

const ICON_BY_KIND: Readonly<Record<SearchResultKind, LucideIcon>> = {
	route: RouteIcon,
	service: Server,
	instance: ServerCog,
	consumer: KeyRound,
};

type ResultRowProps = {
	readonly result: SearchResult;
	readonly isActive: boolean;
	readonly onPick: (result: SearchResult) => void;
};

export function GlobalSearch(): ReactElement {
	const { t } = useTranslation();
	const listboxId = useId();
	const { openSelection } = useGateway();
	const { query, setQuery, results, isLoading } = useGlobalSearch();
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const close = useCallback(() => setIsOpen(false), []);

	useDismissableMenu({ containerRef, isOpen, onDismiss: close });
	const focusSearch = useCallback(() => inputRef.current?.focus(), []);

	useCommandShortcut(SEARCH_SHORTCUT_KEY, focusSearch);

	function pick(result: SearchResult): void {
		openSelection(result.selection);
		setQuery('');
		setIsOpen(false);
		inputRef.current?.blur();
	}

	function handleChange(event: ChangeEvent<HTMLInputElement>): void {
		setQuery(event.target.value);
		setActiveIndex(0);
		setIsOpen(true);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
		if (results.length === 0) {
			return;
		}

		if (event.key === ARROW_DOWN_KEY) {
			event.preventDefault();
			setActiveIndex((index) => wrapIndex(index + 1, results.length));

			return;
		}

		if (event.key === ARROW_UP_KEY) {
			event.preventDefault();
			setActiveIndex((index) => wrapIndex(index - 1, results.length));

			return;
		}

		if (event.key !== ENTER_KEY) {
			return;
		}

		event.preventDefault();
		pick(results[Math.min(activeIndex, results.length - 1)]);
	}

	function handleFocus(): void {
		setIsOpen(true);
	}

	function renderPanel(): ReactElement | null {
		const hasQuery = query.trim() !== '';

		if (!isOpen || !hasQuery) {
			return null;
		}

		if (results.length === 0 && isLoading) {
			return (
				<div className="global-search-panel global-search-loading" aria-busy="true">
					{LOADING_ROWS.map((row) => (
						<Skeleton key={row} height="14px" />
					))}
				</div>
			);
		}

		if (results.length === 0) {
			return <div className="global-search-panel global-search-empty">{t('topbar.search.empty')}</div>;
		}

		return (
			<ul id={listboxId} className="global-search-panel" role="listbox" aria-label={t('topbar.searchAriaLabel')}>
				{results.map((result, index) => (
					<ResultRow key={`${result.kind}:${result.id}`} result={result} isActive={index === activeIndex} onPick={pick} />
				))}
			</ul>
		);
	}

	return (
		<div className="global-search" ref={containerRef}>
			<TextInput
				ref={inputRef}
				className="search"
				label={t('topbar.searchAriaLabel')}
				placeholder={t('topbar.searchPlaceholder')}
				icon={<Search size={ICON_SIZE} />}
				suffix={<kbd>{formatCommandShortcut(SEARCH_SHORTCUT_KEY)}</kbd>}
				value={query}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onFocus={handleFocus}
				role="combobox"
				aria-expanded={isOpen}
				aria-controls={listboxId}
				autoComplete="off"
			/>
			{renderPanel()}
		</div>
	);
}

function ResultRow({ result, isActive, onPick }: ResultRowProps): ReactElement {
	const { t } = useTranslation();
	const Icon = ICON_BY_KIND[result.kind];

	function handleMouseDown(): void {
		onPick(result);
	}

	return (
		<li role="option" aria-selected={isActive} className={`global-search-result ${isActive ? 'is-active' : ''}`} onMouseDown={handleMouseDown}>
			<Icon size={ICON_SIZE} aria-hidden="true" />
			<span className="global-search-title">{result.title}</span>
			<span className="global-search-detail mono">{result.detail}</span>
			<span className="global-search-kind">{t(`topbar.search.kind.${result.kind}`)}</span>
		</li>
	);
}

function wrapIndex(index: number, count: number): number {
	return (index + count) % count;
}

import { Check, ChevronDown } from 'lucide-react';
import {
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactElement,
	type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { ARROW_DOWN_KEY, ARROW_UP_KEY, ENTER_KEY, ESCAPE_KEY, SPACE_KEY, TAB_KEY } from '@/app/lib/keyboardKeys';

import { listboxStyle } from './listboxPosition';
import { navigatedIndex, typeaheadIndex } from './selectNavigation';

import './SelectInput.css';

export type SelectOption<TValue extends string = string> = { readonly value: TValue; readonly label: string };

export type SelectInputProps<TValue extends string> = {
	readonly label: string;
	readonly options: readonly SelectOption<TValue>[];
	readonly value: TValue;
	readonly onChange: (value: TValue) => void;
	readonly tooltip?: string;
	readonly isDisabled?: boolean;
	readonly className?: string;
};

const OPENING_KEYS: ReadonlySet<string> = new Set([ENTER_KEY, SPACE_KEY, ARROW_DOWN_KEY, ARROW_UP_KEY]);
const COMMITTING_KEYS: ReadonlySet<string> = new Set([ENTER_KEY, SPACE_KEY]);

// A combobox button with a listbox portaled to body, so no card or dialog clips it.
// Focus stays on the button; aria-activedescendant points at the highlighted option.
export function SelectInput<TValue extends string>({
	label,
	options,
	value,
	onChange,
	tooltip,
	isDisabled = false,
	className = '',
}: SelectInputProps<TValue>): ReactElement {
	const listboxId = useId();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const listboxRef = useRef<HTMLUListElement>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const [position, setPosition] = useState<CSSProperties | null>(null);
	const selectedIndex = options.findIndex((option) => option.value === value);
	const selectedLabel = options[selectedIndex]?.label ?? '';

	function open(): void {
		setActiveIndex(Math.max(selectedIndex, 0));
		setIsOpen(true);
	}

	function close(): void {
		setIsOpen(false);
		setPosition(null);
	}

	function commit(index: number): void {
		const option = options[index];

		close();
		triggerRef.current?.focus();

		if (option === undefined || option.value === value) {
			return;
		}

		onChange(option.value);
	}

	useLayoutEffect(() => {
		if (!isOpen) {
			return;
		}

		function place(): void {
			const trigger = triggerRef.current;

			if (trigger === null) {
				return;
			}

			setPosition(listboxStyle(trigger.getBoundingClientRect(), window.innerHeight));
		}

		place();
		window.addEventListener('resize', place);
		window.addEventListener('scroll', place, true);

		return () => {
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		function handleOutsideMouseDown(event: MouseEvent): void {
			const target = event.target as Node;
			const isInside = (triggerRef.current?.contains(target) ?? false) || (listboxRef.current?.contains(target) ?? false);

			if (isInside) {
				return;
			}

			setIsOpen(false);
			setPosition(null);
		}

		document.addEventListener('mousedown', handleOutsideMouseDown);

		return () => document.removeEventListener('mousedown', handleOutsideMouseDown);
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const activeOption = listboxRef.current?.children[activeIndex];

		activeOption?.scrollIntoView?.({ block: 'nearest' });
	}, [isOpen, activeIndex, position]);

	function handleTriggerClick(): void {
		if (isOpen) {
			close();

			return;
		}

		open();
	}

	function handleClosedKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
		if (!OPENING_KEYS.has(event.key)) {
			return;
		}

		event.preventDefault();
		open();
	}

	function handleOpenKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
		if (event.key === ESCAPE_KEY) {
			// Stops a surrounding dialog from closing along with the list.
			event.preventDefault();
			event.stopPropagation();
			close();

			return;
		}

		if (event.key === TAB_KEY) {
			close();

			return;
		}

		if (COMMITTING_KEYS.has(event.key)) {
			event.preventDefault();
			commit(activeIndex);

			return;
		}

		const labels = options.map((option) => option.label);
		const nextIndex = navigatedIndex(event.key, activeIndex, options.length) ?? typeaheadIndex(event.key, activeIndex, labels);

		if (nextIndex === null) {
			return;
		}

		event.preventDefault();
		setActiveIndex(nextIndex);
	}

	function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
		if (isOpen) {
			handleOpenKeyDown(event);

			return;
		}

		handleClosedKeyDown(event);
	}

	function optionId(index: number): string {
		return `${listboxId}-option-${index}`;
	}

	function renderOption(option: SelectOption<TValue>, index: number): ReactElement {
		const isSelected = index === selectedIndex;
		const isActive = index === activeIndex;
		const optionClassName = `select-option ${isActive ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}`.trim();

		return (
			// Keyboard selection lives on the combobox (aria-activedescendant); the option only needs the mouse.
			// oxlint-disable-next-line jsx-a11y/click-events-have-key-events
			<li
				key={option.value}
				id={optionId(index)}
				role="option"
				aria-selected={isSelected}
				className={optionClassName}
				onMouseEnter={() => setActiveIndex(index)}
				onClick={() => commit(index)}
			>
				<span className="select-option-label">{option.label}</span>
				{isSelected && <Check size={14} aria-hidden="true" className="select-option-check" />}
			</li>
		);
	}

	const triggerClassName = `select-input ${isOpen ? 'is-open' : ''} ${className}`.trim();
	const activeDescendant = isOpen ? optionId(activeIndex) : undefined;

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				role="combobox"
				aria-label={label}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				aria-controls={isOpen ? listboxId : undefined}
				aria-activedescendant={activeDescendant}
				className={triggerClassName}
				disabled={isDisabled}
				data-tooltip={isOpen ? undefined : tooltip}
				onClick={handleTriggerClick}
				onKeyDown={handleKeyDown}
			>
				<span className="select-input-value">{selectedLabel}</span>
				<ChevronDown size={14} aria-hidden="true" className="select-input-chevron" />
			</button>
			{isOpen &&
				createPortal(
					<ul
						ref={listboxRef}
						id={listboxId}
						role="listbox"
						aria-label={label}
						className={`select-listbox ${position ? 'is-placed' : ''}`.trim()}
						style={position ?? undefined}
					>
						{options.map(renderOption)}
					</ul>,
					document.body,
				)}
		</>
	);
}

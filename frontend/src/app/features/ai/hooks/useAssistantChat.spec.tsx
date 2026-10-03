import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssistantReply, AssistantTurnInput } from '@/app/api/adminApiTypes';
import { EVERY_PROPOSAL, PROPOSALS } from '@/test/proposalFixtures';

import { buildAssistantHistory, MAX_HISTORY_MESSAGES, MAX_MESSAGE_LENGTH, toProposalKey, useAssistantChat, type ChatEntry } from './useAssistantChat';

vi.mock('../../../api/adminApiClient', () => ({
	sendAssistantTurn: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

const { AdminApiError, sendAssistantTurn } = await import('../../../api/adminApiClient');

const CREATE_PROPOSAL = PROPOSALS.create_consumer;

function operator(id: string, content: string): ChatEntry {
	return { kind: 'operator', id, content };
}

function assistant(id: string, content: string, proposals: Extract<ChatEntry, { kind: 'assistant' }>['proposals'] = []): ChatEntry {
	return { kind: 'assistant', id, content, proposals, toolCalls: [] };
}

function reply(overrides: Partial<AssistantReply> = {}): AssistantReply {
	return { reply: 'Pronto.', proposals: [], toolCalls: [], ...overrides };
}

function lastSentInput(): AssistantTurnInput {
	const calls = vi.mocked(sendAssistantTurn).mock.calls;

	return calls[calls.length - 1][0];
}

describe('buildAssistantHistory', () => {
	it('maps the thread onto user/assistant messages', () => {
		const history = buildAssistantHistory([operator('1', 'oi'), assistant('2', 'olá')], new Map());

		expect(history).toEqual([
			{ role: 'user', content: 'oi' },
			{ role: 'assistant', content: 'olá' },
		]);
	});

	it('tells the model what happened to each proposal card', () => {
		const proposals = [CREATE_PROPOSAL, PROPOSALS.drain_instance];
		const outcomes = new Map([[toProposalKey('2', 0), 'confirmed' as const]]);

		const history = buildAssistantHistory([operator('1', 'crie'), assistant('2', '', proposals), operator('3', 'e agora?')], outcomes);

		expect(history[1].content).toBe(
			'(no text)\n\n[Proposal cards: create_consumer loja → confirmed; drain_instance orders-2 → awaiting confirmation]',
		);
	});

	it('names the target of every proposal kind', () => {
		const [, assistantMessage] = buildAssistantHistory([operator('1', 'x'), assistant('2', 'ok', EVERY_PROPOSAL)], new Map());

		for (const expected of [
			'drain_instance orders-2',
			'enable_instance orders-2',
			'set_instance_weight catalog-1',
			'set_lb_strategy users',
			'set_service_timeout orders',
			'set_service_retries orders',
			'set_route_timeout Pedidos',
			'set_route_rate_limit Pedidos',
			'set_consumer_rate_limit partner-x',
			'revoke_api_key mobile-app',
			'create_consumer loja',
			'create_route /api/stock',
			'update_alert_rule route_p95_latency',
			'generate_analysis Pedidos',
			'set_instance_chaos orders-2',
		]) {
			expect(assistantMessage.content).toContain(expected);
		}
	});

	it('names a platform analysis as the platform', () => {
		const proposal = { ...PROPOSALS.generate_analysis, scope: 'platform', subjectId: null, subjectName: null } as const;

		const [, assistantMessage] = buildAssistantHistory([operator('1', 'x'), assistant('2', 'ok', [proposal])], new Map());

		expect(assistantMessage.content).toContain('generate_analysis platform');
	});

	it('keeps only the most recent messages, starting on an operator message', () => {
		const entries = Array.from({ length: MAX_HISTORY_MESSAGES + 1 }, (_, index) =>
			index % 2 === 0 ? operator(String(index), `q${index}`) : assistant(String(index), `a${index}`),
		);

		const history = buildAssistantHistory(entries, new Map());

		expect(history[0].role).toBe('user');
		// The window's first message was the assistant's, so it is dropped.
		expect(history.length).toBe(MAX_HISTORY_MESSAGES - 1);
		expect(history.at(-1)?.content).toBe(`q${MAX_HISTORY_MESSAGES}`);
	});

	it('caps an overlong assistant message and returns nothing without an operator message', () => {
		const longReply = 'x'.repeat(MAX_MESSAGE_LENGTH + 10);

		expect(buildAssistantHistory([operator('1', 'q'), assistant('2', longReply)], new Map())[1].content).toHaveLength(MAX_MESSAGE_LENGTH);
		expect(buildAssistantHistory([assistant('1', 'sozinho')], new Map())).toEqual([]);
	});
});

describe('useAssistantChat', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('sends the history with the browser time zone and appends the reply', async () => {
		vi.mocked(sendAssistantTurn).mockResolvedValue(reply({ proposals: [CREATE_PROPOSAL], toolCalls: ['get_system_health'] }));
		const { result } = renderHook(() => useAssistantChat());

		let isSent = false;

		await act(async () => {
			isSent = await result.current.send('crie a Loja');
		});

		expect(isSent).toBe(true);
		expect(lastSentInput().messages).toEqual([{ role: 'user', content: 'crie a Loja' }]);
		expect(lastSentInput().timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
		expect(result.current.entries.map((entry) => entry.kind)).toEqual(['operator', 'assistant']);
		expect(result.current.entries[1]).toMatchObject({ content: 'Pronto.', proposals: [CREATE_PROPOSAL], toolCalls: ['get_system_health'] });
		expect(result.current.status).toEqual({ status: 'idle' });
		expect(result.current.latestReplyId).toBe(result.current.entries[1].id);
	});

	it('includes recorded card outcomes in the next turn', async () => {
		vi.mocked(sendAssistantTurn).mockResolvedValue(reply({ proposals: [CREATE_PROPOSAL] }));
		const { result } = renderHook(() => useAssistantChat());

		await act(async () => {
			await result.current.send('crie a Loja');
		});
		const assistantEntryId = result.current.entries[1].id;

		act(() => {
			result.current.recordOutcome(toProposalKey(assistantEntryId, 0), 'dismissed');
		});
		await act(async () => {
			await result.current.send('deixa pra lá');
		});

		expect(lastSentInput().messages[1].content).toContain('create_consumer loja → dismissed');
	});

	it.each([
		[new AdminApiError('slow down', 429), 'assistant.rateLimited'],
		[new AdminApiError('no key', 503), 'assistant.notConfigured'],
		[new AdminApiError('messages must contain at least 1 elements', 400), 'messages must contain at least 1 elements'],
		[new TypeError('network'), 'assistant.failed'],
	])('on failure takes the question back out and explains why (%s)', async (error, message) => {
		vi.mocked(sendAssistantTurn).mockRejectedValue(error);
		const { result } = renderHook(() => useAssistantChat());

		let isSent = true;

		await act(async () => {
			isSent = await result.current.send('oi');
		});

		expect(isSent).toBe(false);
		expect(result.current.entries).toEqual([]);
		expect(result.current.status).toEqual({ status: 'error', message });
	});

	it('resets the conversation', async () => {
		vi.mocked(sendAssistantTurn).mockResolvedValue(reply());
		const { result } = renderHook(() => useAssistantChat());

		await act(async () => {
			await result.current.send('oi');
		});

		act(() => {
			result.current.reset();
		});

		expect(result.current.entries).toEqual([]);
		expect(result.current.status).toEqual({ status: 'idle' });
		expect(result.current.latestReplyId).toBeNull();
	});
});

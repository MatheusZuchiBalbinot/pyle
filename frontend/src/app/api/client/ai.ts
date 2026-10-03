import type {
	AiAnalysis,
	AiAnalysisMessage,
	AiAnalysisSummary,
	AiReplyEvent,
	AssistantReply,
	AssistantTurnInput,
	GenerateAiAnalysisInput,
	ListAiAnalysesFilter,
	Page,
	PageQuery,
} from '../adminApiTypes';
import { AdminApiError, appendPageQuery, request, requestJson, toQuery } from './request';

const SSE_FRAME_SEPARATOR = '\n\n';

const SSE_LINE_SEPARATOR = '\n';

const SSE_DATA_PREFIX = 'data: ';

export function getAiAnalysisSummary(): Promise<AiAnalysisSummary> {
	return requestJson('/admin/ai/analyses/summary');
}

export function listAiAnalyses(filter: ListAiAnalysesFilter, page: PageQuery = {}): Promise<Page<AiAnalysis>> {
	const params = new URLSearchParams();

	if (filter.scope) {
		params.set('scope', filter.scope);
	}

	if (filter.subjectId) {
		params.set('subjectId', filter.subjectId);
	}

	appendPageQuery(params, page);

	return requestJson(`/admin/ai/analyses${toQuery(params)}`);
}

export function generateAiAnalysis(input: GenerateAiAnalysisInput): Promise<AiAnalysis> {
	return requestJson('/admin/ai/analyses', { method: 'POST', body: JSON.stringify(input) });
}

export function listAiAnalysisMessages(analysisId: string): Promise<readonly AiAnalysisMessage[]> {
	return requestJson(`/admin/ai/analyses/${encodeURIComponent(analysisId)}/messages`);
}

// fetch, not EventSource: the request is a POST with a bearer token.
export async function* askAiAnalysis(analysisId: string, question: string, signal?: AbortSignal): AsyncGenerator<AiReplyEvent> {
	const init: RequestInit = { method: 'POST', body: JSON.stringify({ question }), signal };
	const response = await request(`/admin/ai/analyses/${encodeURIComponent(analysisId)}/messages`, init);

	if (!response.body) {
		throw new AdminApiError('Empty response', response.status);
	}

	yield* readServerSentEvents(response.body);
}

export function sendAssistantTurn(input: AssistantTurnInput): Promise<AssistantReply> {
	return requestJson('/admin/ai/assistant/messages', { method: 'POST', body: JSON.stringify(input) });
}

async function* readServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AiReplyEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffered = '';

	while (true) {
		const { value, done } = await reader.read();

		if (done) {
			return;
		}

		buffered += decoder.decode(value, { stream: true });
		let separatorIndex = buffered.indexOf(SSE_FRAME_SEPARATOR);

		while (separatorIndex !== -1) {
			const frame = buffered.slice(0, separatorIndex);

			buffered = buffered.slice(separatorIndex + SSE_FRAME_SEPARATOR.length);
			const dataLine = frame.split(SSE_LINE_SEPARATOR).find((line) => line.startsWith(SSE_DATA_PREFIX));

			if (dataLine) {
				const payload = dataLine.slice(SSE_DATA_PREFIX.length);
				const event = JSON.parse(payload) as AiReplyEvent;

				yield event;
			}

			separatorIndex = buffered.indexOf(SSE_FRAME_SEPARATOR);
		}
	}
}

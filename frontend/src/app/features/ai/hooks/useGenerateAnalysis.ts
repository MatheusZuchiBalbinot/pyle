import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminApiError, generateAiAnalysis } from '@/app/api/adminApiClient';
import type { GenerateAiAnalysisInput } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';

export type GenerateAnalysisState =
	{ readonly status: 'idle' } | { readonly status: 'generating' } | { readonly status: 'error'; readonly message: string };

export type UseGenerateAnalysisResult = {
	readonly state: GenerateAnalysisState;
	readonly generate: () => Promise<void>;
};

const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;

// The cooldown (409) and a missing or refused key (503) get their own messages: the operator acts on
// them differently.
export function useGenerateAnalysis(input: GenerateAiAnalysisInput): UseGenerateAnalysisResult {
	const { t } = useTranslation();
	const { toast, openAnalysis } = useGateway();
	const [state, setState] = useState<GenerateAnalysisState>({ status: 'idle' });

	const generate = useCallback(async () => {
		setState({ status: 'generating' });

		try {
			const analysis = await generateAiAnalysis(input);

			setState({ status: 'idle' });
			toast(t('aiAnalysis.ready', { risk: t(`aiAnalysis.risk.${analysis.riskLevel}`) }), 'success');
			openAnalysis(analysis.id);
		} catch (error) {
			const message = toFailureMessage(error, t);

			setState({ status: 'error', message });
			toast(message, 'danger');
		}
	}, [input, toast, openAnalysis, t]);

	return { state, generate };
}

function toFailureMessage(error: unknown, t: (key: string) => string): string {
	if (!(error instanceof AdminApiError)) {
		return t('aiAnalysis.failed');
	}

	if (error.statusCode === HTTP_CONFLICT) {
		return t('aiAnalysis.cooldown');
	}

	if (error.statusCode === HTTP_SERVICE_UNAVAILABLE) {
		return t('aiAnalysis.notConfigured');
	}

	return error.message;
}

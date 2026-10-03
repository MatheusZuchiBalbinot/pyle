// Must run before any other import: the Prisma client reads the database URL.
import '@pyle/shared/config/load-backend-env.js';

import { PrismaClient, type Prisma } from '@prisma/control-plane-client';

import { classifyNotification } from '../apps/control-plane/src/admin-notifications/domain/classify-notification.js';
import type { SuggestedAction } from '../apps/control-plane/src/ai-analysis/domain/parse-generated-analysis.js';
import type { RealtimeEvent } from '../apps/control-plane/src/realtime/domain/realtime-event.js';

// npm run showcase:data (after npm run seed)
// Writes the content the screenshots in showcase/ show and the seed cannot
// make: saved AI analyses with a follow-up conversation, and a tidy
// notifications inbox. Written straight to the database, no model is called.
// Idempotent: the analyses have fixed ids and are replaced on every run.

const MS_PER_MINUTE = 60_000;
const MOCK_MODEL = 'claude-haiku-4-5';
const ANALYSIS_IDS = {
	platformEarlier: '5c0a1f3e-0000-4000-8000-000000000001',
	ordersRoute: '5c0a1f3e-0000-4000-8000-000000000002',
	catalogService: '5c0a1f3e-0000-4000-8000-000000000003',
	platformNow: '5c0a1f3e-0000-4000-8000-000000000004',
} as const;

type Catalog = {
	readonly ordersRouteId: string;
	readonly ordersRouteName: string;
	readonly catalogServiceId: string;
	readonly ordersSlowInstanceId: string;
	readonly catalogInstanceId: string;
};

function minutesAgo(minutes: number): Date {
	return new Date(Date.now() - minutes * MS_PER_MINUTE);
}

function fail(message: string): never {
	console.error(`[showcase] ${message}`);
	process.exit(1);
}

async function loadCatalog(prisma: PrismaClient): Promise<Catalog> {
	const ordersRoute = await prisma.route.findFirst({ where: { pathPrefix: '/api/orders', deletedAt: null } });
	const catalog = await prisma.service.findFirst({ where: { slug: 'catalog', deletedAt: null } });
	const ordersSlow = await prisma.serviceInstance.findFirst({ where: { name: 'orders-2', deletedAt: null } });
	const catalogInstance = await prisma.serviceInstance.findFirst({ where: { name: 'catalog-1', deletedAt: null } });
	const isSeeded = ordersRoute !== null && catalog !== null && ordersSlow !== null && catalogInstance !== null;

	if (!isSeeded) {
		fail('The demo catalog is missing: run "npm run seed" first');
	}

	return {
		ordersRouteId: ordersRoute.id,
		ordersRouteName: ordersRoute.name,
		catalogServiceId: catalog.id,
		ordersSlowInstanceId: ordersSlow.id,
		catalogInstanceId: catalogInstance.id,
	};
}

function toJson(value: unknown): Prisma.InputJsonValue {
	return value as Prisma.InputJsonValue;
}

function buildAnalyses(catalog: Catalog): readonly Prisma.AiAnalysisCreateManyInput[] {
	const drainSlowInstance: SuggestedAction = {
		type: 'drain_instance',
		serviceSlug: 'orders',
		instanceId: catalog.ordersSlowInstanceId,
		instanceName: 'orders-2',
		reason: 'orders-2 responde 40 vezes mais devagar que as irmãs e puxa o p95 da rota inteira.',
	};
	const partnerLimit: SuggestedAction = {
		type: 'set_consumer_rate_limit',
		consumerSlug: 'partner-x',
		consumerName: 'Parceiro X',
		rateLimitPerMinute: 300,
		reason: 'O Parceiro X tem 4 em cada 10 chamadas barradas; se o contrato prevê mais volume, 300/min cobre o pico observado.',
	};

	return [
		{
			id: ANALYSIS_IDS.platformEarlier,
			scope: 'platform',
			windowMinutes: 60,
			summary:
				'O gateway está estável no volume, mas a rota Pedidos teve um episódio de latência alta concentrado em uma única instância, e o Parceiro X segue esbarrando no próprio limite.',
			riskLevel: 'medium',
			highlights: [
				'50 req/s em média, distribuídas entre Pedidos (45%), Catálogo (30%) e Usuários (25%).',
				'p95 de Pedidos chegou a 1,8 s por cerca de 25 minutos; orders-1 e orders-3 ficaram abaixo de 30 ms no mesmo período.',
				'Parceiro X: 2,6 mil respostas 429 na última hora, todas por limite do consumidor (1.200/min).',
				'Nenhum 5xx vindo das instâncias; os erros 4xx são chaves ausentes ou revogadas.',
			],
			recommendations: [
				'Acompanhar orders-2: se a lentidão voltar, drenar a instância antes de investigar.',
				'Confirmar com o Parceiro X o volume contratado antes de mexer no limite.',
			],
			suggestedActions: toJson([]),
			trend: null,
			model: MOCK_MODEL,
			requestedAt: minutesAgo(130),
		},
		{
			id: ANALYSIS_IDS.ordersRoute,
			scope: 'route',
			subjectId: catalog.ordersRouteId,
			subjectName: catalog.ordersRouteName,
			windowMinutes: 15,
			summary:
				'A latência da rota Pedidos vem de orders-2: ela recebe a mesma fatia que as outras (33%), mas responde em ~1,2 s, e com round-robin cada terceira requisição paga esse preço.',
			riskLevel: 'high',
			highlights: [
				'p95 da rota: 1,24 s, acima do limite do alerta (800 ms) há 3 janelas seguidas.',
				'orders-2: p95 1,21 s; orders-1 e orders-3: 24 ms e 26 ms.',
				'Health checks de orders-2 continuam passando: a instância está lenta, não fora do ar, por isso o circuito não abriu.',
				'Há chaos ativo em orders-2 (+1200 ms de latência) desde alguns minutos antes do alerta.',
			],
			recommendations: [
				'Drenar orders-2: o tráfego novo vai para orders-1 e orders-3, que têm folga.',
				'Depois de remover o chaos, reativar a instância e conferir o p95 por alguns minutos.',
				'Para lentidão sem queda, considerar least connections em vez de round-robin.',
			],
			suggestedActions: toJson([drainSlowInstance]),
			trend: null,
			model: MOCK_MODEL,
			requestedAt: minutesAgo(70),
		},
		{
			id: ANALYSIS_IDS.catalogService,
			scope: 'service',
			subjectId: catalog.catalogServiceId,
			subjectName: 'Catálogo',
			windowMinutes: 60,
			summary:
				'O Catálogo está saudável e o balanceamento ponderado faz o que foi pedido: catalog-1, com peso 3, atende três vezes mais que catalog-2.',
			riskLevel: 'low',
			highlights: [
				'Divisão observada 74% / 26%, próxima do 3:1 configurado.',
				'p95 de 49 ms nas duas instâncias, sem erros 5xx.',
				'O peso de catalog-1 foi alterado de 1 para 3 por admin@pyle.local há 6 h.',
			],
			recommendations: ['Nada a fazer agora; se catalog-2 for desligada, rever o peso antes.'],
			suggestedActions: toJson([]),
			trend: null,
			model: MOCK_MODEL,
			requestedAt: minutesAgo(40),
		},
		{
			id: ANALYSIS_IDS.platformNow,
			scope: 'platform',
			windowMinutes: 60,
			summary:
				'Desde a análise anterior a latência de Pedidos voltou ao normal; o único ponto em aberto é o Parceiro X, ainda barrado com frequência.',
			riskLevel: 'low',
			highlights: [
				'p95 do gateway: 45 ms (era 1,1 s no pior momento da análise anterior).',
				'Nenhum alerta aberto; 3 alertas resolvidos nas últimas 2 h.',
				'Parceiro X: 41% das chamadas com 429.',
			],
			recommendations: ['Decidir com o Parceiro X entre subir o limite ou orientar retry com espera.'],
			suggestedActions: toJson([partnerLimit]),
			trend: 'improved',
			trendSummary: 'p95 de Pedidos caiu de 1,24 s para 25 ms depois que orders-2 foi drenada e o chaos removido.',
			previousAnalysisId: ANALYSIS_IDS.platformEarlier,
			model: MOCK_MODEL,
			requestedAt: minutesAgo(8),
		},
	];
}

function buildConversation(): readonly Prisma.AiAnalysisMessageCreateManyInput[] {
	const analysisId = ANALYSIS_IDS.ordersRoute;

	return [
		{ analysisId, role: 'user', content: 'Por que só a orders-2? As três rodam a mesma imagem.', createdAt: minutesAgo(66) },
		{
			analysisId,
			role: 'assistant',
			content:
				'Porque a diferença não está na imagem: orders-2 tem **chaos ativo** (+1200 ms de latência), injetado por admin@pyle.local pouco antes do alerta. As outras duas não têm.\n\nComo os health checks continuam respondendo 200, o gateway a considera saudável e o circuito não abre: lentidão sem falha passa pelos dois mecanismos. Por isso a correção é operacional: **drenar** a instância (o card abaixo da análise faz isso) ou remover o chaos.',
			createdAt: minutesAgo(65),
		},
		{ analysisId, role: 'user', content: 'Drenar derruba as requisições que estão em andamento?', createdAt: minutesAgo(64) },
		{
			analysisId,
			role: 'assistant',
			content:
				'Não. Drenar só tira orders-2 da escolha do balanceador: as requisições em voo terminam normalmente e nenhuma nova chega a ela. É reversível pelo mesmo botão, e a instância continua recebendo health checks enquanto isso.',
			createdAt: minutesAgo(63),
		},
	];
}

// What the inbox would have collected during the story the analyses tell.
function buildNotificationEvents(catalog: Catalog): readonly RealtimeEvent[] {
	return [
		{
			type: 'ai.analysis.ready',
			scope: 'platform',
			subjectId: null,
			subjectName: null,
			analysisId: ANALYSIS_IDS.platformNow,
			riskLevel: 'low',
			occurredAt: minutesAgo(8).toISOString(),
		},
		{
			type: 'alert.resolved',
			alertId: '5c0a1f3e-0000-4000-8000-0000000000a1',
			kind: 'route_p95_latency',
			subjectType: 'route',
			subjectId: catalog.ordersRouteId,
			subjectName: catalog.ordersRouteName,
			occurredAt: minutesAgo(31).toISOString(),
		},
		{
			type: 'instance.state.changed',
			serviceId: catalog.catalogServiceId,
			serviceSlug: 'catalog',
			instanceId: catalog.catalogInstanceId,
			instanceName: 'catalog-1',
			kind: 'health',
			toState: 'healthy',
			reason: '2 consecutive successful health checks',
			occurredAt: minutesAgo(47).toISOString(),
		},
		{
			type: 'instance.state.changed',
			serviceId: catalog.catalogServiceId,
			serviceSlug: 'catalog',
			instanceId: catalog.catalogInstanceId,
			instanceName: 'catalog-1',
			kind: 'health',
			toState: 'unhealthy',
			reason: '3 consecutive failed health checks (HTTP 503)',
			occurredAt: minutesAgo(52).toISOString(),
		},
		{
			type: 'alert.triggered',
			alertId: '5c0a1f3e-0000-4000-8000-0000000000a1',
			kind: 'route_p95_latency',
			severity: 'warning',
			subjectType: 'route',
			subjectId: catalog.ordersRouteId,
			subjectName: catalog.ordersRouteName,
			message: 'p95 latency 1240 ms for 3 consecutive windows (limit 800 ms)',
			occurredAt: minutesAgo(72).toISOString(),
		},
	];
}

function toNotification(event: RealtimeEvent, isRead: boolean): Prisma.AdminNotificationCreateManyInput | null {
	const classification = classifyNotification(event);

	if (classification === null) {
		return null;
	}

	return {
		category: classification.category,
		severity: classification.severity,
		eventType: event.type,
		subjectType: classification.subject?.type ?? null,
		subjectId: classification.subject?.id ?? null,
		payload: toJson(event),
		readAt: isRead ? new Date() : null,
		createdAt: new Date(event.occurredAt),
	};
}

async function main(): Promise<void> {
	const prisma = new PrismaClient();

	try {
		const catalog = await loadCatalog(prisma);
		const analysisIds = Object.values(ANALYSIS_IDS);
		// The two newest stay unread, so the bell has something to say.
		const notifications = buildNotificationEvents(catalog)
			.map((event, index) => toNotification(event, index >= 2))
			.filter((row): row is Prisma.AdminNotificationCreateManyInput => row !== null);

		await prisma.$transaction([
			prisma.aiAnalysisMessage.deleteMany({ where: { analysisId: { in: analysisIds } } }),
			prisma.aiAnalysis.deleteMany({ where: { id: { in: analysisIds } } }),
			prisma.aiAnalysis.createMany({ data: [...buildAnalyses(catalog)] }),
			prisma.aiAnalysisMessage.createMany({ data: [...buildConversation()] }),
			// The inbox is replaced: a demo machine collects noise (restarts, tests).
			prisma.adminNotification.deleteMany({}),
			prisma.adminNotification.createMany({ data: notifications }),
		]);
		console.log(`[showcase] ${analysisIds.length} analyses, a conversation and ${notifications.length} notifications written`);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));

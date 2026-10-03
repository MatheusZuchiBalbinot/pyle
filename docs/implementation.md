# Detalhes de implementação

O desenho geral está em [architecture.md](architecture.md). Esta página conta
como cada parte foi construída.

## O caminho de uma requisição

1. O prefixo mais longo que casa com o caminho escolhe a rota (`404` se
   nenhum casar).
2. Numa rota protegida, o gateway calcula o hash do valor de
   `Authorization: Bearer <chave>`, encontra o consumidor e confere se ele
   pode usar a rota (`401`, `403`). Rotas públicas pulam esta etapa.
3. Primeiro vale o limite do próprio consumidor, depois o limite por
   consumidor da rota, os dois em contadores no Redis que todos os gateways
   compartilham (`429` com `Retry-After`).
4. A estratégia do serviço escolhe uma instância entre as que estão ativas,
   saudáveis e sem circuito aberto (`503` se não sobrar nenhuma).
5. A requisição sai com timeout por tentativa. Requisições idempotentes e sem
   corpo tentam de novo em outra instância (`502`, `504`).
6. A resposta volta em streaming, e a requisição entra nas métricas, no log
   de requisições e na avaliação dos alertas.

## Data plane (`backend/apps/gateway/`)

- `node:http` puro, sem framework no caminho quente. O pipeline da requisição
  é montado com extensões (resiliência, telemetria), e cada uma se encaixa sem
  mexer nas outras.
- A configuração é um snapshot imutável, trocado de forma atômica na recarga,
  então cada requisição vê uma única versão consistente.
- O gateway continua servindo o último snapshot se o control plane ou o
  Postgres sumirem.

## Control plane (NestJS, `backend/apps/control-plane/src/<módulo>/`)

- Cada módulo tem camadas: `interface/` (controllers e DTOs),
  `application/` (serviços, casos de uso), `domain/` (regras e erros
  tipados) e `infrastructure/` (repositórios Prisma, Redis, Docker).
- Os serviços dependem de portas de repositório, não do Prisma, e por isso o
  domínio é testado sem banco.
- Falhas esperadas são erros de domínio tipados (não encontrado, conflito,
  validação, permissão) que filtros de exceção traduzem para status HTTP
  específicos. Stack traces e mensagens do ORM ficam no servidor.
- Cada mudança de configuração vai para a trilha de auditoria na mesma
  transação da escrita, e os gateways só ficam sabendo depois do commit. O
  registro guarda o nome da entidade naquele momento e um detalhe
  estruturado (uma união discriminada: campos alterados, chave emitida,
  chaos, réplicas e assim por diante). O console mostra esse detalhe no
  idioma do operador, e o resumo em inglês que a IA lê sai dele também.
- Um barramento de mudanças, alimentado por um middleware do Prisma, empurra
  eventos ao vivo para o console pelo Centrifugo.
- Soft delete com `deletedAt`, filtrado por padrão nos repositórios, com
  índices únicos parciais para um nome apagado poder ser reusado e um job de
  expurgo com retenção definida.
- Paginação por cursor em todos os endpoints de listagem.
- A escala passa por uma fila serializada, com portas para o driver de
  containers e para a sonda de saúde; um reconciliador leva os containers
  reais até o número pedido.
- Retenção de dados: um agendador apaga amostras e logs antigos em lotes
  limitados.
- A API de admin está documentada no Swagger, em
  `http://localhost:3000/api-docs`.

## Banco de dados

Prisma, com o schema dividido por domínio (`gateway-config`, `traffic`,
`alerts-and-audit`, `ai`, `system-health`, `admin-auth`, `notifications`),
migrations SQL versionadas e índices parciais em SQL puro.

## Observabilidade

- A porta de admin do gateway serve métricas Prometheus (`:8090/metrics`):
  requisições por rota e classe de status, um histograma de latência por
  rota, retries, erros gerados pelo próprio gateway por código, a saúde, o
  circuito e as requisições em voo de cada instância, a versão da
  configuração e se os limites estão deixando passar.
- W3C Trace Context: o gateway entra no trace de quem chama quando recebe um
  `traceparent`, ou começa um novo, e repassa para a instância com ele mesmo
  como span pai. Ele só propaga; não exporta spans.
- Id de correlação por requisição (`x-request-id`), repassado à instância e
  aos logs; log estruturado das requisições.
- Os dois processos têm `/health` (liveness) e `/health/ready`. A prontidão
  do control plane falha quando o Postgres ou o Redis caem; um gateway fora do
  ar não a afeta. A do gateway só falha antes de ele ter uma configuração.
  Sem Postgres ou Redis ele responde `200 degraded` e segue servindo do
  snapshot, para uma queda do banco nunca fazer um balanceador drenar todos os
  gateways de uma vez.
- Os gateways mandam heartbeat, e a tela de saúde do sistema lista cada
  componente. Um gateway que desliga direito se despede e aparece como
  parado; um que some sem avisar dispara um alerta.
- Amostras de tráfego a cada 10 s com histogramas de latência; log de
  requisições por amostragem (todos os erros, 20% dos sucessos).

## Frontend (`frontend/src/app/`)

- Organizado por funcionalidade (`features/<área>/` com a página, os
  componentes, os hooks e as funções puras), mais as primitivas
  compartilhadas em `ui/`, a moldura em `shell/`, o estado global em `core/` e
  o cliente da API.
- Estado com variantes é modelado como união discriminada, verificada de
  forma exaustiva em tempo de compilação.
- Eventos em tempo real atualizam os dados carregados no lugar; as listas vêm
  paginadas do servidor.
- Os tipos da API são escritos à mão. Um contrato verificado na compilação
  (`backend/test/contract/`) quebra o CI quando eles se afastam dos DTOs que o
  control plane de fato envia ou aceita, nos dois sentidos.

## O console

- Ao vivo por WebSocket (Centrifugo): estado das instâncias, tráfego,
  alertas e notificações se atualizam sem recarregar.
- Os gráficos SVG são feitos à mão: tooltip com mira, eixo de tempo que não
  pula, área preenchida sob linhas únicas, linhas que se desenham quando a
  métrica ou a janela muda e reescala suave nas atualizações ao vivo. Os
  indicadores mostram a tendência contra a média do período. O movimento
  para sob `prefers-reduced-motion`.
- O histórico de configuração se lê como frase ("Balanceamento:
  Round-robin → Menos conexões", "chaos: +800 ms de latência"), com o nome da
  entidade, na Visão geral e no painel de cada instância, ao vivo.
- Um select próprio (listbox com navegação por teclado, busca pela primeira
  letra e ARIA), renderizado fora do card para nenhum diálogo cortá-lo.
- Cada lugar tem URL (`/routes/:id`, `/services/orders/instances/:id`,
  `/traffic/routes/:id`, `/ai/:id`...): recarregar, voltar e abrir um link
  levam ao mesmo ponto. Cada página define o título da aba.
- Busca global (`Ctrl K`), diálogos de confirmação para ações destrutivas e
  "Desfazer" na revogação de chaves.
- Todo texto passa pelo i18next em pt-BR, e um teste garante que cada plural
  tem todas as formas.

## Organização do repositório

- `backend/`: um workspace npm com dois apps e um pacote; `npm ci` e todos os scripts rodam a partir de `backend/`.
- `backend/apps/gateway/`: o data plane (`@pyle/gateway`).
- `backend/apps/control-plane/`: os módulos do control plane (`gateway-config`, `traffic`, `ai-analysis`, `ai-assistant`, `auth`, ...) e o seed.
- `backend/packages/shared/`: o que gateway e control plane compartilham (`@pyle/shared`: chaves do Redis, histogramas, hash de chaves, tipos e carregador do snapshot, leitura de env). Os apps importam como `@pyle/shared/<área>/<arquivo>.js`: a checagem de tipos, os testes e o tsx leem o código-fonte, e os builds leem o `dist` compilado.
- `backend/prisma/control-plane/`: o schema do banco e as `migrations/`.
- `backend/scripts/`: o bot de carga, o benchmark e o `dev.sh` (`npm run dev`).
- `backend/test/`: as suítes feature e e2e, e `contract/`, a verificação em compilação dos tipos da API do console.
- `frontend/src/app/`: o console, por área:
  - `features/<área>/` (`overview`, `traffic`, `routes`, `services`, `consumers`, `ai`, `settings`, `notifications`, `auth`): a página, mais os `components/`, `hooks/` e `lib/` daquela área;
  - `ui/`: primitivas compartilhadas (botões, diálogos, tabelas, gráficos, skeletons);
  - `shell/`: a moldura das páginas (barra lateral, barra superior, busca global);
  - `core/`: estado global (contexto do gateway, conexão em tempo real, sessão);
  - `hooks/` e `lib/`: hooks genéricos e funções puras usados por várias áreas;
  - `api/`: o cliente da API de admin e os tipos dos eventos em tempo real.
- `frontend/e2e/`: o teste no navegador (Playwright).
- `infra/demo-service/`: as instâncias de demo; `infra/centrifugo/`: a configuração do tempo real.
- `showcase/`: o console em telas comentadas; `npm run showcase:data` (em `backend/`) grava as análises de IA e as notificações de exemplo que elas mostram.

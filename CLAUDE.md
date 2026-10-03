# Pyle

Projeto de estudo de um API gateway: um data plane, um control plane, um
console de operação e operação assistida por IA. O [README.md](README.md)
explica a arquitetura, as funcionalidades e como rodar.

# Regras de qualidade de código (TypeScript, frontend e backend)

Aplique estas regras por padrão sempre que escrever, editar ou revisar código
neste projeto. São regras fixas, não sugestões: siga sem perguntar, a menos
que o código de um arquivo já siga outra convenção de forma consistente
(nesse caso, mantenha a consistência local em vez de forçar a regra isolada).

## Princípios gerais

- Siga KISS, DRY e Clean Code.
- Retorno antecipado é obrigatório. Nunca escreva `if/else` aninhado:
  inverta a condição e retorne cedo.
- Todo `if` tem chaves e toda instrução termina com ponto e vírgula,
  inclusive os retornos antecipados: `if (!isOk) { return; }`, nunca
  `if (!isOk) return;`.
- Uma linha em branco separa os blocos de uma função: depois das
  declarações, antes e depois de cada bloco (`if`, laços, funções
  aninhadas) e antes do `return`.
- Um arquivo se lê de cima para baixo: imports, depois tipos exportados,
  tipos internos, funções exportadas e funções auxiliares internas.
  Constantes e classes mantêm a ordem (não sofrem hoisting).
- Essas regras de layout são aplicadas pelo ESLint (`eslint.config.js` em
  cada pacote, ao lado do oxlint); `npm run format` aplica as regras e depois
  o Prettier.
- Código, nomes de identificadores, comentários e rotas são sempre em
  inglês. Textos para o usuário (strings de i18n) ficam fora dessa regra.
- Variáveis booleanas começam com `is`/`has`/`should`/`can`.
- Nunca use tipos primitivos soltos onde um `type`/DTO nomeado deixaria a
  intenção clara. Prefira objetos de valor pequenos e dedicados (por
  exemplo, uma classe ou função que monta o caminho de um arquivo) a uma
  string crua interpolada em vários lugares.

## Assinaturas e chamadas de função

- Uma função com mais de uns 3 ou 4 parâmetros recebe um único objeto
  tipado, nunca uma lista de parâmetros posicionais.
- Nenhuma chamada de função, hook ou componente leva um objeto literal
  anônimo quebrado em várias linhas como argumento. Se o objeto não cabe
  numa linha, extraia para uma variável tipada antes da chamada; a chamada
  fica sempre numa linha só.

  ```ts
  // Wrong
  const { x } = fn({
    a,
    b,
    c,
  });

  // Right
  type FnInput = { a: A; b: B; c: C };
  const fnInput: FnInput = { a, b, c };
  const { x } = fn(fnInput);
  ```

- Quando o objeto extraído tem só propriedades abreviadas simples, mantenha
  numa linha só, sem quebrar propriedade por propriedade. Só aceite um objeto
  em várias linhas quando ele tem lógica de verdade (corpos de função,
  closures) que não cabe numa linha.
- Se o mesmo formato de objeto é passado mais de uma vez, ou tem mais de uns
  4 campos, declare um `type`/`interface` nomeado em vez de duplicar um
  literal anônimo.
- Uma expressão com mais de uma operação (uma chamada aninhada, um `.find`
  com valor padrão, encadeamento) usada direto como argumento de outra
  chamada precisa ser extraída antes para uma variável nomeada.

  ```ts
  // Wrong
  const plaintext = decrypt(keyRing, docId, base64ToBytes(snapshot.ciphertext));

  // Right
  const ciphertextBytes = base64ToBytes(snapshot.ciphertext);
  const plaintext = decrypt(keyRing, docId, ciphertextBytes);
  ```

## Condições

- Uma condição com mais de uma variável ou comparação, ou que seja longa e
  difícil de ler de relance mesmo com uma comparação só contra uma expressão
  pouco óbvia, vira uma variável booleana nomeada antes do `if`/ternário.
  Nunca deixe a composição solta dentro da condição. O nome diz _o que_ está
  sendo verificado, e não repete a comparação.

  ```ts
  // Wrong
  if (keyStatus === 'pending' || keyStatus === 'error') { ... }

  // Right
  const isKeyUnavailable = keyStatus === 'pending' || keyStatus === 'error'
  if (isKeyUnavailable) { ... }
  ```

- Ternários aninhados são proibidos (`a ? b : c ? d : e`). Reescreva como
  uma função com retornos antecipados ou uma tabela de consulta: um ternário
  aninhado é exatamente o tipo de coisa que passa numa revisão rápida e vira
  bug.

## Nomes, tipos e constantes

- Nenhum número ou string mágica solto no meio da lógica. Todo valor
  "mágico" (um limite, um timeout, um status code, uma chave de
  configuração, um número de tentativas) vira uma constante nomeada,
  declarada uma vez, com um nome que diz o que ela significa (e não o que
  ela é).

  ```ts
  // Wrong
  if (retries > 3) { ... }
  await sleep(30000)

  // Right
  const MAX_RETRIES = 3
  const RETRY_DELAY_MS = 30_000
  if (retries > MAX_RETRIES) { ... }
  await sleep(RETRY_DELAY_MS)
  ```

- `any` é proibido. Quando um tipo é de fato desconhecido em tempo de
  compilação, use `unknown` e estreite explicitamente antes de usar: `any`
  desliga o verificador de tipos justamente onde ele mais importa.
- Marque `readonly` em arrays, objetos e campos que não devem mudar depois de
  criados (`ReadonlyArray<T>` num parâmetro que só lê uma lista, campos
  `readonly` num tipo de configuração), para o compilador pegar uma mutação
  acidental em vez de uma surpresa em produção.
- Uma função nunca altera os parâmetros que recebeu. Trate a entrada como
  imutável e devolva um valor novo.

  ```ts
  // Wrong
  function addItem(list: Item[], item: Item) {
    list.push(item);
  }

  // Right
  function addItem(list: Item[], item: Item): Item[] {
    return [...list, item];
  }
  ```

- Nomes booleanos são sempre afirmativos, nunca negados (`isNotDisabled`,
  `hasNoErrors` são proibidos: ficam ilegíveis quando você precisa negá-los
  de novo). Use `isEnabled`, `hasErrors`.
- Um conjunto fixo de valores nunca é um `string`/`number` solto: modele como
  uma união de literais ou um enum. `status: string` aceita em silêncio um
  erro de digitação como `'aproved'`; `status: 'pending' | 'approved' | 'rejected'`
  não compila se você errar.
- Um `switch`/cadeia de `if-else` sobre uma união discriminada é exaustivo e
  verificado na compilação: o `else`/`default` final passa o valor para um
  parâmetro do tipo `never`, então quem adicionar uma variante nova e
  esquecer de tratá-la aqui quebra o build em vez de falhar em silêncio em
  produção.

  ```ts
  function assertUnreachable(value: never): never {
    throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
  }
  // in the final branch: assertUnreachable(job)
  ```

- Um parâmetro opcional que muda o comportamento inteiro da função quando
  passado é proibido: são duas funções disfarçadas de uma. Separe em duas
  funções nomeadas ou modele a entrada como uma união discriminada.
- Nada de abreviações obscuras nos nomes (`usr`, `doc`, `cfg`, `tmp`), menos
  as universais no domínio (`id`, `url`, `dto`). Um nome completo não custa
  nada para escrever e poupa tempo de quem lê depois.
- Toda função exportada tem tipo de retorno explícito, e não inferido. A
  inferência serve para uma função auxiliar interna pequena; para o que faz
  parte da superfície pública de um módulo, o tipo de retorno é um contrato
  que precisa aparecer na assinatura, e não sair em silêncio da
  implementação atual.
- Nenhum módulo exporta estado mutável direto (`export let currentUser =
null`): isso deixa qualquer importador reatribuir sem controle. Exporte uma
  função de leitura (`getCurrentUser()`) e uma de escrita controlada
  (`setCurrentUser()`) em vez da variável crua.
- Nenhuma dependência circular entre módulos (A importa de B e B importa de
  volta de A, direta ou indiretamente). Isso indica uma fronteira de
  responsabilidade mal desenhada: resolva extraindo o que os dois precisam
  para um terceiro módulo, e não ignorando o aviso do bundler.

## Modelagem de estado e variantes

Vale para qualquer lugar onde o estado mora: um componente React, um campo
de uma classe de serviço, uma coluna de status de um job ou registro, uma
entrada de cache em memória.

- Estados ou variantes mutuamente exclusivos (qual modal está aberto, em que
  etapa um job ou pedido está, que resultado uma validação produziu) nunca
  viram vários campos nullable/booleanos independentes: nada impede dois de
  ficarem ligados ao mesmo tempo. Modele como uma união discriminada num
  único valor.

  ```ts
  // Wrong (equally wrong in a React component's state or a backend record)
  type Job = {
    isQueued: boolean;
    isRunning: boolean;
    isFailed: boolean;
    errorMessage: string | null;
  };

  // Right
  type Job =
    | { status: 'queued' }
    | { status: 'running'; startedAt: Date }
    | { status: 'failed'; errorMessage: string }
    | { status: 'completed'; result: JobResult };
  ```

  O mesmo princípio aplicado ao estado da interface:

  ```ts
  type VaultModal = { type: 'share'; doc: DocumentSummaryDTO } | { type: 'delete-document'; doc: DocumentSummaryDTO };

  const [activeModal, setActiveModal] = useState<VaultModal | null>(null);
  ```

- Não guarde nem cacheie um valor que dá para derivar de outro estado no
  ponto de uso: calcule na hora, ou memorize explicitamente (`useMemo` no
  frontend, um cache explícito com invalidação no backend) só quando o
  cálculo for caro de verdade.
- Todo lugar que cria uma assinatura reativa ou observa mudanças
  (dependências de `useEffect`, assinatura de um emissor de eventos, um
  observador de arquivos, um laço de polling) declara o conjunto completo de
  dependências: nenhuma faltando, nenhuma sobrando.
- Um bloco de `let` + `if/else` que reatribui uma variável para decidir o que
  devolver vira uma função pura que devolve o resultado direto. Vale tanto
  para decidir o que renderizar quanto para decidir que resposta ou valor uma
  função produz.

  ```ts
  // Wrong
  let title = t('default');
  if (isArchivedView) title = t('archived');

  // Right
  function resolveTitle(): string {
    if (isArchivedView) {
      return t('archived');
    }

    return t('default');
  }
  const title = resolveTitle();
  ```

- `.filter`/`.map`/`.reduce` com mais de uma condição composta (um ternário
  dentro do predicado, várias comparações) ganha um predicado nomeado e
  extraído, seja para filtrar linhas de uma lista na interface, seja para
  filtrar registros num serviço ou numa consulta.

## Lógica dentro de callbacks e handlers

Vale para qualquer lugar onde uma função é passada como valor: uma prop de
JSX, um handler de rota ou controller, um `.then()`/`.catch()`, um listener
de evento, um processador de job, um middleware.

- Nenhuma lógica com mais de uma operação, closure com corpo de verdade ou
  `find`/`&&` fazendo papel de `if` fica inline onde se espera um callback.
  Extraia para uma função nomeada e passe por referência.

  ```tsx
  // Wrong (frontend)
  onDeleteFolder={(id) => setDeleteFolderTarget(folders.find((f) => f.id === id) ?? null)}

  // Right
  function handleDeleteFolderRequest(folderId: string) {
      const folder = folders.find((f) => f.id === folderId) ?? null
      setDeleteFolderTarget(folder)
  }
  // ...
  onDeleteFolder={handleDeleteFolderRequest}
  ```

  ```ts
  // Wrong (backend)
  router.post('/documents/:id/archive', async (req, res) => {
    const doc = await docs.findById(req.params.id);
    if (doc && doc.ownerId === req.user.id) {
      await docs.archive(doc.id);
    }
    res.sendStatus(204);
  });

  // Right
  async function handleArchiveDocument(req: Request, res: Response) {
    const doc = await docs.findById(req.params.id);
    const canArchive = doc !== null && doc.ownerId === req.user.id;

    if (!canArchive) {
      return res.sendStatus(403);
    }

    await docs.archive(doc.id);
    res.sendStatus(204);
  }
  router.post('/documents/:id/archive', handleArchiveDocument);
  ```

- Um simples repasse de chamada sem lógica extra (`onClick={() => setOpen(true)}`,
  `router.get('/health', healthCheckHandler)`) pode ficar inline: extrair só
  traria ruído. A regra é sobre lógica escondida dentro do callback, e não
  sobre callbacks existirem.

## Performance e memória no frontend

- Não recrie um objeto, array ou função a cada render quando ele vai como
  prop para um filho memorizado (`React.memo`) ou serve de dependência em
  outro lugar: use `useMemo`/`useCallback` quando a estabilidade da
  identidade importa de fato. Não use `useMemo`/`useCallback` por reflexo
  onde nada depende da identidade e o cálculo é barato: é custo sem
  benefício.
- Nunca busque nem segure no cliente um conjunto de dados sem limite quando
  existe paginação, cursor ou filtro no servidor. Renderizar centenas ou
  milhares de nós para uma lista da qual o usuário vai rolar só um pedaço
  pede virtualização, e não um `.map` simples.
- Operações caras disparadas por entrada rápida do usuário (busca enquanto
  digita, resize, scroll) usam debounce ou throttle: nunca rodam a cada
  tecla ou evento sem proteção.
- Toda assinatura, timer (`setInterval`/`setTimeout`) ou listener criado num
  `useEffect` (ou em qualquer ciclo de vida manual) tem uma limpeza que roda
  ao desmontar ou antes de o efeito rodar de novo. Um efeito que começa algo
  sem jeito de parar é um vazamento.
- Evite cópias profundas desnecessárias de estruturas grandes: clone só o
  pedaço que precisa de isolamento, e não o grafo inteiro.
- Segredos decifrados ou texto sensível (chaves, tokens, conteúdo
  decifrado) ficam na memória só pelo tempo necessário e saem do estado
  quando o uso termina: não cacheie material decifrado por mais tempo do que
  a funcionalidade exige, nem deixe ele preso em closures que vivem além do
  propósito.
- Cuidado com retenção acidental: uma closure, um cache ou um mapa no nível
  do módulo que só cresce (por exemplo, chaveado por id de documento ou de
  usuário), sem expulsão nem teto, é um vazamento de memória em sessões
  longas (vale igual para processos longos no backend; veja abaixo).

## Arquitetura e camadas no backend

- Controllers e handlers de rota só orquestram: leem e validam a entrada,
  chamam a camada de domínio ou serviço e transformam o resultado numa
  resposta. Nenhuma regra de negócio, consulta direta ao banco ou SQL/ORM cru
  mora num controller.
- As regras de negócio moram numa camada de domínio ou serviço, e não
  espalhadas por controllers, triggers do banco e cópias da mesma validação
  no frontend. Se uma regra precisa valer em mais de uma camada por um motivo
  legítimo (por exemplo, uma constraint do banco como última linha de
  defesa), a camada de serviço continua sendo a fonte da verdade e é
  verificada primeiro.
- O acesso a dados (consultas, chamadas ao ORM) fica isolado numa camada de
  repositório/DAO. Os serviços dependem de uma interface de repositório, e
  não do query builder ou do client cru: é isso que deixa o domínio testável
  sem um banco de verdade.
- Todo handler valida a entrada contra um schema/DTO explícito na fronteira
  (corpo, query, parâmetros de caminho, cabeçalhos de que depende) antes de
  qualquer outra coisa. Nunca confie que o frontend oficial é o único
  chamador.
- As respostas da API usam DTOs de resposta explícitos, e não a entidade
  crua do banco/ORM. Nunca vaze campos internos (hash de senha, flags
  internas, dados de outros usuários trazidos por um join) só porque estão
  no objeto serializado.

## Tratamento de erros e logs

- Os erros são tratados na camada que tem contexto para decidir o que fazer
  com eles: não capture e logue de forma genérica só na borda mais externa.
- Separe erros de domínio esperados (falha de validação, não encontrado,
  conflito, sem permissão) dos inesperados (bug, falha de infraestrutura).
  Os esperados viram uma classe de erro tipada e um status HTTP específico:
  nunca um 500 genérico para algo que quem chama pode provocar (entrada
  ruim, recurso inexistente).
- Nunca engula um erro em silêncio (bloco `catch` vazio, `catch { return
null }` sem um comentário explicando por que a falha é segura de ignorar).
  Se uma falha é de fato "melhor esforço" e segura de ignorar, diga isso num
  comentário.
- As respostas de erro para o cliente nunca levam stack trace, caminhos de
  arquivo internos, SQL cru ou mensagens do ORM. Logue o detalhe completo no
  servidor e devolva uma mensagem segura e genérica.
- Logue no ponto onde o erro faz sentido, com contexto estruturado
  suficiente (id da requisição, id do usuário, id da entidade) para
  rastrear, e não só a mensagem solta. Evite logar dados sensíveis (tokens,
  senhas, conteúdo decifrado, dados pessoais completos), mesmo em nível de
  debug.

## Banco de dados e persistência

- Qualquer conjunto de escritas que precisa dar certo ou falhar junto roda
  numa única transação. Não faça escritas relacionadas como instruções
  separadas contando com o app não cair no meio.
- Proteja dados disputados (saldos, contadores, alocação de vagas) contra
  condições de corrida com uma transação mais o nível de isolamento ou lock
  de linha adequado: nunca leia e depois escreva em duas idas ao banco sem
  proteção.
- Evite o padrão N+1: buscar uma lista e depois consultar uma vez por item
  num laço. Use um join, um `WHERE id IN (...)` em lote ou um dataloader.
- Toda coluna usada em `WHERE`, `JOIN` ou `ORDER BY` numa tabela de tamanho
  relevante tem índice: não conte com a varredura completa continuar rápida
  porque a tabela é pequena hoje.
- As migrations são aditivas e compatíveis com o código em produção sempre
  que possível (adicione a coluna nullable ou com valor padrão antes do
  deploy que precisa dela, e só remova depois que o caminho antigo sumir):
  evite uma migration que quebre a versão anterior no meio do deploy.
- Conexões e clients (pool do banco, clients HTTP, arquivos abertos) são
  reaproveitados de um pool compartilhado, e não criados a cada requisição e
  deixados abertos.

## Soft delete e ciclo de vida dos dados

- Ações destrutivas para o usuário (apagar um documento, remover um membro,
  arquivar um recurso) usam soft delete por padrão (`deletedAt: Date | null`
  ou um campo de status explícito) em vez de um `DELETE` de verdade, a menos
  que haja um motivo legal ou de compliance para apagar na hora (e então diga
  isso no código ou num comentário, sem apagar em silêncio).
- Toda consulta ou método de repositório que não trata explicitamente de
  registros apagados os exclui por padrão (`WHERE deleted_at IS
NULL` ou o equivalente do ORM): não conte com cada chamador lembrar de
  filtrar; centralize o padrão na camada de consulta.
- Restrições de unicidade e regras de negócio levam em conta as linhas
  apagadas: o e-mail de um usuário apagado não deveria bloquear para sempre
  um novo cadastro com o mesmo e-mail, e um recurso apagado não deveria
  contar em silêncio para um limite que supõe só linhas ativas.
- Relações e joins nunca vazam dados apagados sem querer (por exemplo, um
  membro apagado ainda aparecendo na lista de membros de um documento por um
  join que não filtrou `deleted_at`).
- A restauração (quando existe) é simétrica ao apagar: desfaz exatamente o
  que o apagar mudou e não restaura em silêncio para um estado inconsistente
  (por exemplo, restaurar um documento numa pasta que foi apagada nesse
  meio-tempo).
- Dados com soft delete têm uma política de retenção explícita se algum dia
  forem expurgados (job em segundo plano, ação de admin): não deixe linhas
  apagadas acumulando para sempre sem uma decisão sobre o ciclo de vida, e
  não as expurgue sem confirmar que nada mais depende do histórico (trilha
  de auditoria, histórico de cobrança).
- Prefira um timestamp (`deletedAt`) a um booleano (`isDeleted`) quando você
  precisa saber _quando_ algo foi apagado, e não só se foi: isso costuma ser
  necessário para políticas de retenção, trilhas de auditoria e
  funcionalidades do tipo "restaurar em até N dias".

## Performance e memória no backend

- Todo endpoint de listagem é paginado (cursor ou offset) por padrão: nunca
  devolva um conjunto sem limite que cresce com os dados.
- Cacheie leituras caras e repetidas (chamadas a APIs externas, agregações
  pesadas) com uma estratégia de invalidação explícita: não cacheie sem um
  plano para atualizar dados velhos, nem deixe de cachear algo claramente
  quente só porque ninguém pediu.
- Trabalho longo ou pesado (processar arquivos, mandar notificações em massa,
  gerar relatórios) roda num job ou fila em segundo plano, e não dentro do
  ciclo de requisição e resposta.
- Um cache no nível do módulo ou um mapa em memória usado entre requisições
  (por exemplo, um cache simples no processo) tem uma estratégia de expulsão
  (TTL, LRU, tamanho máximo): um mapa sem limite chaveado por requisição,
  usuário ou entidade é um vazamento lento num processo longo.
- Payloads grandes (upload e download de arquivos grandes, exportações
  grandes) são processados em streaming ou em pedaços, e não carregados
  inteiros na memória.

## Segurança e controle de acesso

- Todo endpoint que age sobre um recurso específico confere se quem chama tem
  permissão sobre _aquele_ recurso, e não só se está autenticado: verifique
  IDOR e escalada horizontal de privilégio explicitamente (o usuário A
  consegue agir sobre o recurso do usuário B trocando um id na requisição?).
- Checagens de papel e permissão valem no servidor em toda ação sensível,
  nunca supostas porque o frontend já esconde o botão ou o item de menu.
- Toda entrada externa (corpo, query, parâmetros, cabeçalhos, uploads) é
  validada e sanitizada: nunca concatenada direto numa consulta, num comando
  de shell ou num caminho de arquivo.
- Segredos (chaves de API, credenciais do banco, chaves de assinatura) vêm do
  ambiente ou de um gerenciador de segredos, nunca escritos no código,
  commitados ou logados.
- Endpoints sensíveis ou caros (login, redefinição de senha, envio de
  convite, qualquer coisa que dispare e-mail/SMS ou custe dinheiro) têm
  limite de requisições.
- Operações criptográficas usam primitivas e bibliotecas consagradas, nunca
  algoritmos feitos em casa. Chaves e nonces saem de uma fonte aleatória
  criptograficamente segura e nunca são reaproveitados entre contextos onde
  a unicidade importa.

## Idempotência e concorrência

- Qualquer operação que o cliente pode repetir (retry de rede, clique duplo,
  reentrega de webhook) é segura de rodar mais de uma vez com o mesmo efeito:
  use uma chave de idempotência ou uma restrição de unicidade natural onde a
  operação não é idempotente por natureza (por exemplo, "criar um
  pagamento").
- Jobs em segundo plano e handlers de webhook supõem entrega "pelo menos uma
  vez" e são escritos para tolerar execução duplicada.

## Testes

- Os testes miram o risco real: lógica de negócio crítica, fronteiras de
  segurança e controle de acesso, e código que já quebrou antes. Não miram
  cobertura de linhas por si só.
- Um teste que faz mock de todos os colaboradores a ponto de não conseguir
  falhar quando a lógica real quebra não é um teste útil; se um cenário
  precisa de interação real entre camadas, escreva um teste de integração em
  vez de encher um teste unitário de mocks.
- Toda função com mais de um caminho relevante tem um teste por caminho,
  incluindo os de erro e os casos de borda, e não só o caminho feliz.
- Uma regressão corrigida em produção ganha um teste que a reproduz, para
  ela não voltar em silêncio.

## Configuração e observabilidade

- A configuração é validada na subida (variáveis de ambiente obrigatórias,
  faixas válidas): o app falha cedo com um erro claro, em vez de falhar
  depois, no fundo de uma requisição, com um erro confuso de referência nula.
- Logs estruturados com ids de correlação/requisição para tudo o que vai
  precisar ser rastreado entre serviços ou por um job assíncrono.
- Health checks e readiness refletem o estado real das dependências (banco
  alcançável, fila alcançável), e não só "o processo está rodando".

## Quando NÃO aplicar (evite exagero)

- Um objeto de configuração estático que já cabe confortavelmente numa linha
  não precisa de um tipo próprio nem de extração forçada.
- Não crie um tipo ou abstração para um objeto de uma propriedade só ou um
  uso trivial e único: isso derrota o propósito destas regras.
- Closures triviais de uma linha (por exemplo, um getter/setter sobre uma
  variável local) não precisam virar uma função nomeada por princípio:
  extraia quando de fato melhorar a leitura, e não por regra cega.
- Não force agrupar as props de um componente em objetos só porque a lista
  é longa: só vale quando esse agrupamento se repete em mais de um
  componente. Uma lista longa de props soltas, cada uma com um dado
  diferente, não é o mesmo problema de um objeto anônimo montado dentro de
  uma chamada.
- Não introduza fila, cache, transação ou soft delete numa operação de pouco
  tráfego e pouco risco onde a complexidade a mais não traz ganho real: cada
  regra acima mira um modo de falha concreto, e não uma lista a aplicar
  igual em qualquer contexto.
- Não adicione limite de requisições, chaves de idempotência ou validação
  pesada a endpoints internos, chamados só por quem é confiável, onde o
  modelo de ameaças não pede isso: guarde esse rigor para as fronteiras que
  recebem entrada não confiável.
- Não transforme em constante nomeada um valor óbvio usado uma vez num
  contexto claramente trivial (`array[0]` para "o primeiro elemento",
  `padding: 0`). A regra de constantes mágicas mira valores cujo significado
  não é óbvio pelo contexto ou que podem mudar ou ser reaproveitados, e não
  todo literal que aparece no código.

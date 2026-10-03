# Pyle

API gateway study project: a data plane, a control plane, an operator
console and AI-assisted operation. See [README.md](README.md) for the
architecture, features and how to run it.

# Code quality rules (TypeScript — frontend and backend)

Apply these rules by default whenever writing, editing, or reviewing code
in this codebase. These are standing rules, not suggestions — follow them
without asking, unless the existing code in a file already follows a
different, consistent convention (in that case, match local consistency
instead of forcing the rule in isolation).

## General principles

- Follow KISS, DRY, and Clean Code.
- Early return is mandatory. Never write nested `if/else` — invert the
  condition and return early instead.
- Every `if` has braces and every statement ends with a semicolon, early
  returns included: `if (!isOk) { return; }`, never `if (!isOk) return;`.
- One blank line separates the blocks of a function: after the
  declarations, before and after every block statement (`if`, loops,
  nested functions), and before the `return`.
- A file reads top-down: imports, then exported types, internal types,
  exported functions, internal helpers. Constants and classes keep their
  order (they are not hoisted).
- These layout rules are enforced by ESLint (`eslint.config.js` in each
  package, next to oxlint); `npm run format` applies them and then
  Prettier.
- Code, identifier names, comments, and routes are always in English.
  User-facing text (i18n strings) is exempt from this rule.
- Boolean variables are prefixed with `is`/`has`/`should`/`can`.
- Never use loose primitive types where a named `type`/DTO would make the
  intent clear. Prefer small, dedicated value objects (e.g. a class or
  function to build a file path) over a raw string interpolated in several
  places.

## Function signatures and calls

- A function with more than ~3-4 parameters takes a single typed object,
  never a list of positional parameters.
- No function/hook/component call contains an anonymous object literal
  broken across multiple lines as an inline argument. If the object
  doesn't fit on one line, extract it into a typed variable before the
  call — the call itself always stays on one line.

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

- When the extracted object has simple shorthand properties, keep it on a
  single line — don't break it property by property. Only accept a
  multi-line object when it genuinely contains logic (function bodies,
  closures) that can't physically fit on one line.
- If the same object "shape" is passed more than once, or has more than
  ~4 fields, declare a named `type`/`interface` for it instead of
  duplicating an anonymous literal.
- An expression with more than one operation (a nested call, a `.find`
  with a fallback, chaining) used directly as another call's argument must
  be extracted into a named variable first.

  ```ts
  // Wrong
  const plaintext = decrypt(keyRing, docId, base64ToBytes(snapshot.ciphertext));

  // Right
  const ciphertextBytes = base64ToBytes(snapshot.ciphertext);
  const plaintext = decrypt(keyRing, docId, ciphertextBytes);
  ```

## Conditions

- A condition with more than one variable/comparison, or that's simply
  long/hard to scan at a glance even with a single comparison against a
  non-obvious expression, is extracted into a named boolean variable
  before the `if`/ternary — never leave the composition loose inside the
  condition itself. The name should describe _what_ is being checked, not
  restate the comparison.

  ```ts
  // Wrong
  if (keyStatus === 'pending' || keyStatus === 'error') { ... }

  // Right
  const isKeyUnavailable = keyStatus === 'pending' || keyStatus === 'error'
  if (isKeyUnavailable) { ... }
  ```

- Nested ternaries are forbidden (`a ? b : c ? d : e`). Rewrite as a
  function with early returns, or a lookup table — a nested ternary is
  exactly the kind of thing that slips through a quick review and turns
  into a bug.

## Naming, types, and constants

- No magic number or magic string loose in the middle of logic. Every
  "magic" value — a threshold, a timeout, a status code, a config key, a
  retry count — becomes a named constant, declared once, with a name that
  says what it means (not what it is).

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

- `any` is forbidden. When a type is genuinely unknown at compile time,
  use `unknown` and narrow it explicitly before use — `any` turns off the
  type checker exactly where it matters most.
- Mark `readonly` on arrays/objects/fields that shouldn't mutate after
  creation (`ReadonlyArray<T>` on a parameter that only reads a list,
  `readonly` fields on a config type) so the compiler catches an
  accidental mutation instead of a runtime surprise.
- A function never mutates the parameters it received. Treat input as
  immutable and return a new value instead.

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

- Boolean names are always phrased affirmatively, never negated
  (`isNotDisabled`, `hasNoErrors` are forbidden — they become unreadable
  the moment you need to negate them again). Use `isEnabled`, `hasErrors`.
- A fixed set of possible values is never a loose `string`/`number` — model
  it as a union of literals or an enum. `status: string` silently accepts
  a typo like `'aproved'`; `status: 'pending' | 'approved' | 'rejected'`
  doesn't compile if you get it wrong.
- A `switch`/`if-else` chain over a discriminated union is exhaustive and
  checked at compile time — the final `else`/`default` assigns the value
  to a `never`-typed parameter, so adding a new variant later and
  forgetting to handle it here breaks the build instead of failing
  silently at runtime.

  ```ts
  function assertUnreachable(value: never): never {
    throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
  }
  // in the final branch: assertUnreachable(job)
  ```

- An optional parameter that changes the function's entire behavior when
  set is forbidden — that's two functions disguised as one. Split into two
  named functions, or model the input as a discriminated union.
- No cryptic abbreviations in names (`usr`, `doc`, `cfg`, `tmp`), except
  abbreviations that are universal in the domain (`id`, `url`, `dto`). A
  full name costs nothing to write and saves time for whoever reads it
  later.
- Every exported function has an explicit return type, not an inferred
  one. Inference is fine for a small internal helper; for anything that's
  part of a module's public surface, the return type is a contract that
  should be visible in the signature, not silently derived from the
  current implementation.
- No module exports mutable state directly (`export let currentUser =
null`) — that lets any importer reassign it uncontrolled. Export a
  read function (`getCurrentUser()`) and a controlled write function
  (`setCurrentUser()`) instead of the raw variable.
- No circular dependency between modules (A imports from B, B imports back
  from A, directly or transitively). That's a sign of a poorly drawn
  responsibility boundary — fix it by extracting what both need into a
  third module, not by ignoring the bundler's warning.

## State and variant modeling

This applies wherever state lives — a React component, a service class
field, a job/record status column, an in-memory cache entry.

- Mutually exclusive states/variants (which modal is open in a UI, which
  stage a job or order is in, which outcome a validation produced) are
  never modeled as several independent nullable/boolean fields — nothing
  stops two of them from being set at the same time. Model it as a
  discriminated union in a single value.

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

  The same principle applied to UI state:

  ```ts
  type VaultModal = { type: 'share'; doc: DocumentSummaryDTO } | { type: 'delete-document'; doc: DocumentSummaryDTO };

  const [activeModal, setActiveModal] = useState<VaultModal | null>(null);
  ```

- Don't store/cache a value that's derivable from other state/data at the
  point of use — compute it on demand, or memoize explicitly (`useMemo` on
  the frontend, an explicit cache with invalidation on the backend) only
  when the computation is genuinely expensive.
- Every place that sets up a reactive subscription or watches for change
  (`useEffect` deps, an event emitter subscription, a file watcher, a
  polling loop) declares its full set of dependencies/triggers explicitly
  and completely — no missing dependency, no unnecessary one.
- A block of `let` + `if/else` reassigning a variable to decide what to
  return or produce becomes a pure function that returns the result
  directly — this applies to deciding what to render just as much as
  deciding what response/value a function produces.

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

- `.filter`/`.map`/`.reduce` with more than one composed condition (a
  ternary inside the predicate, multiple comparisons) becomes a named,
  extracted predicate — whether that's filtering rows for a UI list or
  filtering records in a service/query-building function.

## Inline logic in callbacks and handlers

This applies to any place a function is passed as a value — a JSX prop, a
route/controller handler, a `.then()`/`.catch()`, an event listener, a
queue job processor, a middleware.

- No logic with more than one operation, a closure with a real body, or a
  `find`/`&&` standing in for an `if` goes inline where a callback is
  expected. Extract it into a named function first, then pass the
  function by reference.

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

- A plain forward of a call with no extra logic (`onClick={() => setOpen(true)}`,
  `router.get('/health', healthCheckHandler)`) can stay inline — extracting
  it would add noise, not clarity. The rule is about hidden logic inside
  the callback, not about callbacks existing at all.

## Frontend performance and memory

- Don't recreate a new object/array/function on every render when it's
  passed as a prop to a memoized child (`React.memo`) or used as a
  dependency elsewhere — wrap it in `useMemo`/`useCallback` when that
  identity stability actually matters. Don't reach for `useMemo`/
  `useCallback` reflexively where nothing downstream depends on referential
  stability and the computation is cheap — that's overhead without benefit.
- Never fetch or hold an entire unbounded dataset client-side when
  pagination, cursoring, or server-side filtering is available. Rendering
  hundreds/thousands of DOM nodes for a list the user will only scroll a
  fraction of calls for virtualization, not a plain `.map`.
- Expensive operations triggered by fast user input (search-as-you-type,
  resize, scroll handlers) are debounced or throttled — never run on every
  keystroke/event unguarded.
- Every subscription, timer (`setInterval`/`setTimeout`), or event listener
  set up in a `useEffect` (or any manually-managed lifecycle) has a
  matching cleanup that runs on unmount or before the effect re-runs. An
  effect that starts something without a way to stop it is a leak.
- Avoid unnecessary deep copies/clones of large structures — clone only
  the slice that actually needs isolation, not the whole object graph.
- Decrypted secrets or sensitive plaintext (keys, tokens, decrypted
  content) are kept in memory only for as long as they're needed and
  cleared/dropped from state once their use is done — don't cache
  decrypted material longer than the feature actually requires, and don't
  let it linger in closures that outlive their purpose.
- Watch for accidental retention: a closure, cache, or module-level map
  that keeps growing (e.g. keyed by document/user id) with no eviction or
  upper bound is a memory leak in long-lived sessions (this applies
  equally to long-running backend processes — see below).

## Backend architecture and layering

- Controllers/route handlers only orchestrate: parse and validate input,
  call the domain/service layer, map the result to a response. No business
  rule, no direct database query, and no raw SQL/ORM call lives in a
  controller.
- Business rules live in a domain/service layer, not scattered across
  controllers, database triggers, and frontend validation copies of the
  same rule. If a rule must be enforced in more than one layer for
  legitimate reasons (e.g. DB constraint as a last line of defense), the
  service layer is still the source of truth and is checked first.
- Data access (queries, ORM calls) is isolated in a repository/DAO layer.
  Services depend on a repository interface, not on the query builder or
  raw client directly — this is what makes the domain layer testable
  without a real database.
- Every request handler validates its input against an explicit schema/DTO
  at the boundary (body, query params, path params, headers it relies on)
  before anything else runs. Never trust that the official frontend is the
  only caller.
- API responses use explicit response DTOs, not the raw database
  entity/ORM model. Never leak internal-only fields (password hash,
  internal flags, other users' data pulled in via a join) just because
  they happen to be on the object being serialized.

## Error handling and logging

- Errors are handled at the layer that has enough context to decide what
  to do with them — don't catch-and-log-generically at the outermost
  boundary as the only handling.
- Distinguish expected domain errors (validation failure, not found,
  conflict, permission denied) from unexpected ones (bug, infra failure).
  Expected errors map to a specific, typed error class and a specific HTTP
  status — never a generic 500 for something the caller could reasonably
  trigger (bad input, missing resource).
- Never swallow an error silently (empty `catch` block, `catch { return
null }` without a comment explaining why the failure is safe to ignore).
  If a failure is genuinely best-effort and safe to ignore, say so in a
  comment.
- Error responses returned to the client never include stack traces,
  internal file paths, raw SQL, or ORM error messages. Log the full detail
  server-side, return a safe, generic message to the caller.
- Log at the point where the error is meaningful, with enough structured
  context (request id, user id, entity id) to trace it — not just the
  error message on its own. Avoid logging sensitive data (tokens,
  passwords, decrypted content, full PII) even at debug level.

## Database and persistence

- Any set of writes that must succeed or fail together runs inside a
  single transaction. Don't perform related writes as separate statements
  relying on the app not crashing in between.
- Guard against race conditions on shared/contended data (balances,
  counters, seat/slot allocation) with a transaction plus the appropriate
  isolation level or row lock — never read-then-write across two separate
  round trips without protection.
- Avoid N+1 query patterns: fetching a list, then querying once per item
  in a loop. Use a join, a batched `WHERE id IN (...)`, or a dataloader
  pattern instead.
- Indexes exist for every column used in a `WHERE`, `JOIN`, or `ORDER BY`
  on a table with non-trivial size — don't rely on a full table scan
  staying fast because the table is small today.
- Migrations are additive and backward-compatible with the currently
  deployed code whenever possible (add a column nullable/with a default
  before a deploy that requires it, drop it only after the old code path
  is gone) — avoid a migration that breaks the previous version mid-rollout.
- Connections/clients (DB pool, HTTP clients, file handles) are reused
  from a shared pool, not created per request/operation and left unclosed.

## Soft deletes and data lifecycle

- User-facing destructive actions (delete a document, remove a member,
  archive a resource) default to a soft delete (`deletedAt: Date | null`,
  or an explicit status field) instead of a hard `DELETE`, unless there's a
  stated legal/compliance reason to erase immediately (then say so
  explicitly in the code/comment, don't silently hard-delete).
- Every read query/repository method that isn't explicitly about
  soft-deleted records excludes them by default (`WHERE deleted_at IS
NULL` or the ORM equivalent) — don't rely on every call site
  remembering to filter; centralize the default in the query layer.
- Uniqueness constraints and business rules account for soft-deleted rows:
  a soft-deleted user's email shouldn't permanently block a new signup
  with the same email, and a soft-deleted resource shouldn't silently
  count toward a limit/quota that assumes only active rows.
- Relations/joins never leak soft-deleted data implicitly (e.g. a deleted
  member still showing up in a document's member list through a join that
  didn't filter on `deleted_at`).
- Restore functionality (when offered) is symmetric with delete: it
  reverses exactly what delete changed, and doesn't silently restore into
  an inconsistent state (e.g. restoring a document into a folder that was
  itself deleted in the meantime).
- Soft-deleted data has an explicit retention policy if it's ever
  permanently purged (background job, explicit admin action) — don't leave
  soft-deleted rows accumulating forever with no lifecycle decision made
  about them, and don't purge them without confirming nothing still
  depends on the historical record (audit trail, billing history).
- Prefer a timestamp (`deletedAt`) over a bare boolean (`isDeleted`) when
  you need to know _when_ something was deleted, not just whether — this
  is usually needed for retention policies, audit trails, and "restore
  within N days" features.

## Backend performance and memory

- Every list/collection endpoint is paginated (cursor or offset) by
  default — never return an unbounded result set that grows with the data.
- Cache expensive, frequently-repeated reads (external API calls,
  heavy aggregations) with an explicit invalidation strategy — don't cache
  without a plan for how stale data gets refreshed, and don't skip caching
  something clearly hot just because it wasn't asked for.
- Long-running or resource-heavy work (file processing, sending bulk
  notifications, report generation) runs in a background job/queue, not
  inline in the request/response cycle.
- A module-level cache or in-memory map used across requests (e.g. a
  simple in-process cache) has an eviction strategy (TTL, LRU, max size) —
  an unbounded map keyed by request/user/entity id is a slow memory leak
  in a long-running process.
- Streaming/chunked processing is used for large payloads (big file
  uploads/downloads, large exports) instead of loading the entire payload
  into memory at once.

## Security and access control

- Every endpoint that operates on a specific resource checks that the
  authenticated caller has permission over _that_ resource, not just that
  they're authenticated — check for IDOR/horizontal privilege escalation
  explicitly (can user A act on user B's resource by changing an id in the
  request).
- Role/permission checks are enforced server-side on every sensitive
  action, never assumed from the frontend already hiding the button/menu
  item.
- All external input (body, query, params, headers, file uploads) is
  validated and sanitized — never concatenated directly into a query,
  shell command, or file path.
- Secrets (API keys, DB credentials, signing keys) come from environment/
  secret manager configuration, never hardcoded, committed, or logged.
- Sensitive/expensive endpoints (login, password reset, invite send,
  anything that triggers an email/SMS or costs money) have rate limiting.
- Cryptographic operations use vetted primitives/libraries, never
  hand-rolled algorithms. Keys and nonces are generated with a
  cryptographically secure random source, never reused across contexts
  where uniqueness matters.

## Idempotency and concurrency

- Any operation that can be retried by the client (network retry, double
  click, webhook redelivery) is safe to run more than once with the same
  effect — use an idempotency key or a natural uniqueness constraint where
  the operation isn't naturally idempotent (e.g. "create a payment").
- Background jobs and webhook handlers assume at-least-once delivery and
  are written to tolerate duplicate execution.

## Testing

- Tests target real risk: critical business logic, security/access-control
  boundaries, and code that has broken before — not raw line coverage.
- A test that mocks every collaborator to the point where it can't
  actually fail when the real logic breaks is not a meaningful test; if a
  scenario needs real interaction between layers, write it as an
  integration test instead of over-mocking a unit test.
- Every function that has more than one meaningful branch has a test per
  branch, including the error/edge-case paths — not only the happy path.
- A regression that was fixed in production gets a test that reproduces
  it, so it can't silently come back.

## Configuration and observability

- Configuration is validated at startup (required env vars, valid ranges)
  — the app fails fast with a clear error instead of failing later, deep
  in a request, with a confusing null-reference-style error.
- Structured logging with correlation/request ids is used for anything
  that will need to be traced across services or through an async job.
- Health checks and readiness checks reflect real dependency status (DB
  reachable, queue reachable), not just "the process is running."

## When NOT to apply (avoid over-engineering)

- A static config object that already fits comfortably on one line
  doesn't need a dedicated type or forced extraction.
- Don't create a type/abstraction for a single-property object or a
  trivial one-off use — that defeats the purpose of these rules.
- Trivial one-line closures (e.g. a getter/setter closing over a local
  variable) don't need to become a separately named function just on
  principle — extract when it genuinely improves readability, not by
  blind rule.
- Don't force grouping component props into objects just because the list
  is long — it's only worth it when that specific grouping repeats across
  more than one component. A long list of loose props each carrying a
  distinct piece of data isn't the same problem as an anonymous object
  built inline in a call.
- Don't introduce a queue, cache, transaction, or soft-delete layer for a
  low-traffic, low-risk operation where the added complexity has no real
  payoff — each rule above targets a concrete failure mode, not a
  checklist to apply uniformly regardless of context.
- Don't add rate limiting, idempotency keys, or heavy validation to
  internal-only, trusted-caller endpoints where the threat model doesn't
  call for it — reserve that rigor for boundaries that actually face
  untrusted input.
- Don't name-constant a value that's self-evident and used exactly once in
  an obviously trivial context (`array[0]` for "the first element",
  `padding: 0`). The magic-constant rule targets values whose meaning
  isn't obvious from context or that could plausibly change/be reused —
  not every literal that appears in the code.

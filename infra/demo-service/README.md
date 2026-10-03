# demo-service

The backends the pyle gateway routes to in the demo. One small Node process
per instance (`orders-1`, `orders-2`, ...), no dependencies, deterministic
JSON, a little natural latency, and faults the console can inject.

`docker compose up -d` starts seven instances:

| Instance                     | Service | Port        |
| ---------------------------- | ------- | ----------- |
| orders-1, orders-2, orders-3 | orders  | 48101-48103 |
| users-1, users-2             | users   | 48111-48112 |
| catalog-1, catalog-2         | catalog | 48121-48122 |

## Routes

Paths as the instance sees them, after the gateway strips the route prefix
(`/api/orders/42` reaches an orders instance as `/42`).

| Service   | Routes                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| orders    | `GET /` (page: `?limit=` up to 100, `?offset=`), `GET /:id`, `POST /` (201, echoes the body with a new id) |
| users     | `GET /`, `GET /:id`                                                                                        |
| catalog   | `GET /items`, `GET /items/:id`                                                                             |
| every one | `GET /health`, and `GET /api/public/health` (the same, for the public route, which keeps its prefix)       |

`HEAD` is answered like `GET`, without a body.

Every response is JSON with `service` and `instance`, and carries an
`x-demo-instance` header. Ids 1-200 exist; the data is derived from the id,
so every instance answers the same.

## Chaos

`GET` and `PUT /__chaos` with the header `x-chaos-token: $CHAOS_TOKEN`
(without the right token the endpoint answers 404, as if it did not exist).
The body of a `PUT`:

```json
{ "latencyMs": 800, "jitterMs": 200, "errorRate": 0.3, "isDown": false }
```

- `latencyMs` + a random 0..`jitterMs`: added to every request.
- `errorRate`: fraction of requests answered `500 {"error":"injected"}`.
- `isDown`: `503` on everything, health checks included (except `/__chaos`,
  so it can be turned back on).

The gateway strips `x-chaos-token` from client requests, so a consumer can't
reach this through a route. The console drives it through the control plane
(`PUT /admin/services/:slug/instances/:id/chaos`) when `CHAOS_ALLOWED=true`.

## Running one by hand

```sh
SERVICE_NAME=orders INSTANCE_ID=orders-9 PORT=48109 CHAOS_TOKEN=some-secret node server.mjs
node --test server.test.mjs
```

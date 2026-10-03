# demo-service

Os backends para onde o gateway do pyle roteia na demo. Um processo Node
pequeno por instância (`orders-1`, `orders-2`...), sem dependências, com JSON
determinístico, um pouco de latência natural e falhas que o console injeta.

O `docker compose up -d` sobe sete instâncias:

| Instância                    | Serviço | Porta       |
| ---------------------------- | ------- | ----------- |
| orders-1, orders-2, orders-3 | orders  | 48101-48103 |
| users-1, users-2             | users   | 48111-48112 |
| catalog-1, catalog-2         | catalog | 48121-48122 |

## Rotas

Os caminhos como a instância os vê, depois que o gateway tira o prefixo da
rota (`/api/orders/42` chega numa instância de orders como `/42`).

| Serviço | Rotas                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| orders  | `GET /` (página: `?limit=` até 100, `?offset=`), `GET /:id`, `POST /` (201, devolve o corpo com um id novo) |
| users   | `GET /`, `GET /:id`                                                                                         |
| catalog | `GET /items`, `GET /items/:id`                                                                              |
| todos   | `GET /health` e `GET /api/public/health` (o mesmo, para a rota pública, que mantém o prefixo)               |

`HEAD` é respondido como `GET`, sem corpo.

Toda resposta é JSON com `service` e `instance`, e leva o cabeçalho
`x-demo-instance`. Os ids de 1 a 200 existem; os dados saem do próprio id,
então todas as instâncias respondem igual.

## Chaos

`GET` e `PUT /__chaos` com o cabeçalho `x-chaos-token: $CHAOS_TOKEN` (sem o
token certo o endpoint responde 404, como se não existisse). O corpo de um
`PUT`:

```json
{ "latencyMs": 800, "jitterMs": 200, "errorRate": 0.3, "isDown": false }
```

- `latencyMs` mais um aleatório de 0 a `jitterMs`: somado a toda requisição.
- `errorRate`: fração das requisições respondidas com
  `500 {"error":"injected"}`.
- `isDown`: `503` em tudo, health check incluído (menos o `/__chaos`, para
  dar para religar).

O gateway tira o `x-chaos-token` das requisições dos clientes, então um
consumidor não chega aqui por uma rota. O console comanda o chaos pelo
control plane (`PUT /admin/services/:slug/instances/:id/chaos`) quando
`CHAOS_ALLOWED=true`.

## Rodando uma à mão

```sh
SERVICE_NAME=orders INSTANCE_ID=orders-9 PORT=48109 CHAOS_TOKEN=some-secret node server.mjs
node --test server.test.mjs
```

**English** | [Русский](README.ru.md)

# small-server-template

A GitHub template for a small API / MCP server: click **Use this template**, run `docker compose up`, and you get a working HTTP service with health probes, OpenAPI docs, bearer-token auth, and an MCP endpoint.

Stack: TypeScript, Hono (Node.js), PostgreSQL + Drizzle ORM, Bun as the package manager, pino logging, oxlint + oxfmt, Vitest.

## What is inside

- HTTP server on Hono: `GET /health` (liveness), `GET /ready` (readiness with a `SELECT 1` check), OpenAPI spec at `/openapi.json`, Scalar UI at `/doc`.
- PostgreSQL via Drizzle ORM: migrations run at startup, before the port opens.
- Bearer-token auth: tokens live in Postgres, the secret is shown once, CLI inside the container.
- MCP module: Streamable HTTP transport at `/mcp` in the same process, with an example `echo` tool.
- Modular composition: every module connects with one line in `src/app.ts` and is disabled the same way.
- Conventional Commits (commitlint + native hooks) and manual releases via changelogen.

## Quick start

1. Click **Use this template** and create your repository.
2. Copy the env defaults and change the database password:

   ```sh
   cp .env.example .env
   ```

3. Start Postgres and the server:

   ```sh
   docker compose up -d --build
   ```

   Migrations run at startup; the port opens only after they finish.

4. Check that everything is alive:

   ```sh
   curl -sS http://localhost:3000/health   # {"status":"ok"}
   curl -sS http://localhost:3000/ready    # {"status":"ok"} — checks the database
   ```

5. Open the API docs: <http://localhost:3000/doc> (Scalar UI, spec at `/openapi.json`).
6. Create a token and call the protected API slot:

   ```sh
   docker compose exec server node dist/token.js create --name demo
   curl -sS http://localhost:3000/api -H "Authorization: Bearer <secret from the previous step>"
   ```

## Environment variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `3000` | HTTP server port. |
| `DATABASE_URL` | — | PostgreSQL URL (`postgres://` or `postgresql://`). Required. |
| `LOG_LEVEL` | `info` | pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. |
| `AUTH_DISABLED` | `false` | `true` disables bearer checks — local development only. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `app` / — / `app` | Local Postgres credentials from `docker-compose.yml`; compose builds `DATABASE_URL` from them. |

Invalid env stops the process at startup with a readable error (fail-fast). For an external database use `docker compose -f compose.external-db.yml up` with `DATABASE_URL` from `.env`.

Run one replica: migrations apply at startup, and the template targets the "small" scale.

## Tokens and CLI

Tokens are static bearer tokens stored in Postgres: the database keeps only a SHA-256 hash, and the CLI prints the secret once at creation — it cannot be recovered later.

```sh
docker compose exec server node dist/token.js list                 # table without secrets
docker compose exec server node dist/token.js create --name bot    # prints the secret once
docker compose exec server node dist/token.js revoke bot           # revoke by id or name
```

The bearer middleware guards `/api` and `/mcp`; `/health`, `/ready`, and `/doc` stay open. Requests without a token, with an invalid or revoked one get `401`. Lost the secret? Create a new token with the same name. Locally the same commands are available via `npm run token -- list` (after `npm run build`).

## Disabling modules

Modules are assembled in one place — the `modules` array in `src/app.ts`:

```ts
export const modules: AppModule[] = [healthModule, apiModule, mcpModule];
```

To disable a module, remove or comment out its element:

```ts
export const modules: AppModule[] = [healthModule, apiModule]; // MCP is off
```

The server starts without the `/mcp` route, and the rest of the endpoints keep working.

## Connecting an MCP client

The MCP endpoint is `POST /mcp` (Streamable HTTP, stateless mode) with an `Authorization: Bearer <secret>` header.

Check it with a raw request:

```sh
curl -sS http://localhost:3000/mcp \
  -H "Authorization: Bearer <secret>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

Or use MCP Inspector / any MCP client: endpoint `http://localhost:3000/mcp`, header `Authorization: Bearer <secret>`.

Add tools in `src/modules/mcp/tools/registry.ts` — one element in the `mcpTools` array (name, description, zod schema, handler); the `echo` example shows the shape. The registry is transport-agnostic, so tools survive future transports (for example, stdio).

## Webhook bot pattern

The template ships no bot code, but the server is ready to host one: add a module with a webhook route to the same Hono app.

1. Create `src/modules/bot/routes.ts` following `src/modules/api/routes.ts`.
2. Register the route, for example `POST /webhook/telegram`, and process the update.
3. Add one line to the `modules` array in `src/app.ts`.
4. Guard the route with the same bearer middleware (or verify the provider's secret header inside the handler):

```ts
app.use(`/webhook/*`, bearerAuth({ repository: deps.tokens, disabled: deps.authDisabled, logger: deps.logger }));
```

Keep the bot token in env (`src/env.ts`), point the provider at `https://<your-host>/webhook/<provider>` — and request-id logs, health probes, and graceful shutdown come for free.

## A note on OAuth

A static bearer token is enough for a private service with a handful of clients. If you expose the server publicly — especially an MCP server for third-party users — switch to OAuth 2.1 (the authorization flow from the MCP specification) instead of shared static tokens.

## Development

```sh
bun install         # dependencies (Bun is the package manager)
npm run dev         # tsx watch, expects a reachable DATABASE_URL
npm run test        # Vitest
npm run lint        # oxlint
npm run format      # oxfmt
npm run build       # tsup bundle into dist/
npm run db:generate # new Drizzle migration from schema changes
```

Commits follow Conventional Commits (`type: subject`, no `Co-authored-by`). Releases are manual: Actions → **Release**.

## License

[MIT](LICENSE)

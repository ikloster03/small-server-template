**English** | [Русский](README.ru.md)

# small-server-template

A GitHub template for a small API / MCP server: click **Use this template**, run `docker compose up`, and you get a working HTTP service with health probes, OpenAPI docs, bearer-token auth, an MCP endpoint, and a built-in background-jobs queue.

Stack: TypeScript, Hono on Bun, SQLite (`bun:sqlite`) + Drizzle ORM, pino logging, oxlint + oxfmt, Vitest.

## What is inside

- HTTP server on Hono (Bun runtime): `GET /health` (liveness), `GET /ready` (readiness with a `SELECT 1` check), OpenAPI spec at `/openapi.json`, Scalar UI at `/doc`.
- Embedded SQLite via Drizzle ORM: WAL mode, migrations run at startup, before the port opens. No database container.
- Bearer-token auth: tokens live in SQLite, the secret is shown once, CLI inside the container.
- Background jobs: a queue table in the same database with an in-process worker — delayed jobs, retries with backoff, dead-letter status.
- MCP module: Streamable HTTP transport at `/mcp` in the same process, with an example `echo` tool.
- Modular composition: every module connects with one line in `src/app.ts` and is disabled the same way.
- Conventional Commits (commitlint + native hooks) and manual releases via changelogen.

## Quick start

1. Click **Use this template** and create your repository.
2. Copy the env defaults:

   ```sh
   cp .env.example .env
   ```

3. Start the server (a single container — the database is embedded):

   ```sh
   docker compose up -d --build
   ```

   Migrations run at startup; the port opens only after they finish. The SQLite file lives on the `db-data` volume.

4. Check that everything is alive:

   ```sh
   curl -sS http://localhost:3000/health   # {"status":"ok"}
   curl -sS http://localhost:3000/ready    # {"status":"ok"} — checks the database
   ```

5. Open the API docs: <http://localhost:3000/doc> (Scalar UI, spec at `/openapi.json`).
6. Create a token and call the protected API slot:

   ```sh
   docker compose exec server bun dist/token.js create --name demo
   curl -sS http://localhost:3000/api -H "Authorization: Bearer <secret from the previous step>"
   ```

## Environment variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `3000` | HTTP server port. |
| `DATABASE_PATH` | — | Path to the SQLite file. Required; in the container compose sets `/data/app.db`. |
| `LOG_LEVEL` | `info` | pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. |
| `AUTH_DISABLED` | `false` | `true` disables bearer checks — local development only. |

Invalid env stops the process at startup with a readable error (fail-fast).

Run one replica: SQLite allows a single writer process, and the template targets the "small" scale (a handful of users, tens of jobs per second). The queue and the database live in one file — back up by copying it.

## Tokens and CLI

Tokens are static bearer tokens stored in SQLite: the database keeps only a SHA-256 hash, and the CLI prints the secret once at creation — it cannot be recovered later.

```sh
docker compose exec server bun dist/token.js list                 # table without secrets
docker compose exec server bun dist/token.js create --name bot    # prints the secret once
docker compose exec server bun dist/token.js revoke bot           # revoke by id or name
```

The bearer middleware guards `/api` and `/mcp`; `/health`, `/ready`, and `/doc` stay open. Requests without a token, with an invalid or revoked one get `401`. Lost the secret? Create a new token with the same name. Locally the same commands are available via `bun run token -- list` (after `bun run build`).

## Background jobs

Jobs live in the `jobs` table of the same SQLite database and survive restarts. The worker runs in the same process as the HTTP server and polls the queue every second.

```ts
// src/main.ts — handlers are wired in createJobHandlers()
const jobsQueue = createJobsQueue(pool.db);
const jobsWorker = createJobsWorker(jobsQueue, createJobHandlers(logger));
jobsWorker.start();

// anywhere in your code:
await jobsQueue.enqueue({ kind: "log-example", payload: { hello: "world" } });
// delayed:
await jobsQueue.enqueue({ kind: "log-example", payload: {}, runAt: new Date(Date.now() + 60_000) });
```

A failing job is retried with growing backoff; after `maxAttempts` (default 3) it becomes `failed` — the dead letter. The queue module is optional: remove those lines from `src/main.ts` and everything else keeps working.

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

The MCP endpoint is `POST /mcp` (Streamable HTTP, stateless mode) with an `Authorization: Bearer <token>` header.

Check it with a raw request:

```sh
curl -sS http://localhost:3000/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

Or use MCP Inspector / any MCP client: endpoint `http://localhost:3000/mcp`, header `Authorization: Bearer <token>`.

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
bun install         # dependencies (Bun is the runtime and package manager)
bun run dev         # bun --watch, Bun loads .env automatically
bun run test        # Vitest (runs on Node, bun:sqlite is shimmed via node:sqlite)
bun run lint        # oxlint
bun run format      # oxfmt
bun run build       # tsup bundle into dist/
bun run db:generate # new Drizzle migration from schema changes
```

Commits follow Conventional Commits (`type: subject`, no `Co-authored-by`). Releases are manual: Actions → **Release**.

## License

[MIT](LICENSE)

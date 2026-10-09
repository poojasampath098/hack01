# Genra — Hire AI-Native Creators

Genra is a cinematic AI Content Creator Marketplace for brands and creative agencies. It helps teams discover verified AI creators, publish structured briefs, evaluate AI-specific portfolios, and move from match to a tracked engagement (invite → proposal → shortlist → hire → delivery → revision → complete).

## Run it

Prerequisites: Node.js 18+ (Node 20 recommended). MongoDB is **optional**.

```bash
npm install
npm run dev          # starts Vite on http://localhost:3000 AND the API on http://localhost:4000
```

Alternative (split processes, same ports):

```bash
npm run server       # or: npm start  →  Express API alone on http://localhost:4000
```

`npm run dev` runs both. If you only want the Vite client against an already-running API: `npx vite --host 0.0.0.0 --port 3000`. The Vite dev server proxies `/api` to the Express API on port 4000 (see `vite.config.ts`).

### MongoDB (optional)

If `MONGODB_URI` (or `MONGO_URI`) is set and reachable, models persist to MongoDB. Otherwise the API runs in **memory-fallback mode** with a built-in deterministic seed — everything still works, but data resets on restart.

- `npm run seed` — persists the seed dataset (6 creators, 3 briefs, 2 demo users) to MongoDB. Idempotent. When MongoDB is unreachable it prints the memory-mode notice and exits 0 instead of failing.
- `MONGODB_URI=mongodb://127.0.0.1:27017/genra npm run seed`

### Demo accounts

Pre-seeded in both memory mode and `npm run seed`:

| Account | Email | Password | Type |
|---|---|---|---|
| Demo Brand | `demo@genra.ai` | `demo1234` | Brand |
| Demo Creator | `mara@example.com` | `creator123` | Creator |

## Build, type-check, and test

All verified locally against a `node v20+`/Vite environment:

```bash
npm run typecheck    # tsc --noEmit -p tsconfig.json
npm run build        # vite build → dist/
npm test             # runs all 5 backend test suites sequentially (85 tests)
```

End-to-end audit (run fresh each time): a 30-step live workflow against the running API — register (role escalation blocked) → login/JWT/verify → creator search/filters → brand creates brief → ranked matches → invite → proposal → shortlist → hire (budget auto-applied) → in_progress → deliver → revision loop → re-deliver → complete (terminal 422) → messages → brief-ownership 403 → studio owner-scoping 404 → generate → stats. **30/30 pass.** The three 4xx gates are by design: proposal only from `invited/viewed`, invalid transitions → 422, outsider → 403.

Individual suites (each boots its own API instance on an isolated port):

```bash
node server/test-server.mjs               # 6  · foundation: health, creators, briefs, builder, 404, malformed JSON
node server/test-creator-api.mjs          # 12 · creator profile & portfolio CRUD
node server/test-brief-api.mjs            # 11 · brief CRUD, publish/close, matches, invite, builder
node server/test-new-apis.mjs             # 37 · auth (10), engagements (9), studio (18)
node server/test-engagement-workflow.mjs  # 19 · full engagement lifecycle, transitions (422), permissions (403)
```

## Architecture

- `client/src` — React/Vite app (React Router-style view state). Entry: `index.html` → `/client/src/main.tsx`.
- `server/` — Express API with modular routes and services (health, creators, briefs, auth, engagements, studio), a Mongoose model layer, and an in-memory seed fallback.
- `client/src/data/assets.ts` — replaceable media URLs / CSS gradient posters.
- Design: light editorial liquid-glass, Instrument Serif + Kanit, verification cyan `#5EEAD4`, purple-to-orange CTA gradient.

## API surface

| Module | Endpoints |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/verify` |
| Creators | `GET /api/creators` (search/filter/sort/paginate/facets), `GET /api/creators/:id` (id or `@handle`), `POST /api/creators`, `PUT|PATCH /api/creators/:id`, `DELETE /api/creators/:id`, portfolio CRUD under `/api/creators/:id/portfolio` |
| Briefs | `GET /api/briefs`, `GET /api/briefs/:id`, `POST /api/briefs`, `PUT|PATCH /api/briefs/:id`, `POST /api/briefs/:id/publish`, `POST /api/briefs/:id/close`, `DELETE /api/briefs/:id`, `GET /api/briefs/:id/matches`, `POST /api/briefs/:id/invite`, `POST /api/brief-builder` |
| Engagements | `GET /api/engagements` (filter by `briefId`, `creatorId`, `ownerEmail`, `creatorEmail`, `creatorName`, `participantEmail`, `status`), `POST /api/engagements`, `GET /api/engagements/:id`, `PATCH /api/engagements/:id/status`, `POST /api/engagements/:id/proposal`, `POST /api/engagements/:id/revision`, `POST /api/engagements/:id/messages`, `PATCH /api/engagements/:id/messages/read` |
| Studio | `GET|POST /api/studio/projects`, `GET|PATCH|DELETE /api/studio/projects/:id`, `POST /api/studio/generate`, `GET /api/studio/history`, `GET|PATCH|DELETE /api/studio/history/:id`, `GET /api/studio/stats` |

### Engagement lifecycle

`invited → `(`viewed` | `proposal`) → `shortlisted` → `hired` → `in_progress` → `delivered` → `completed`, with `declined` / `cancelled` terminal states and a brand-requested revision loop (`delivered → in_progress` with feedback). Transitions are validated (invalid move → `422`), role-gated (brand-only vs creator-only actions → `403` on violation), and every change is recorded in `statusHistory`. Legacy statuses (`accepted`, `in-progress`, `closed`) map to canonical values on read.

Headers used for actor context: `x-user-email`, `x-user-id`, `x-user-name`, `x-account-type`. Auth endpoints use `Authorization: Bearer <token>`; a dev-mode `x-user-email` bypass is supported in `requireAuth.mjs`.

## Frontend ↔ API integration

- Creators, briefs, brief builder, matches, invites, and the engagement dashboard are wired to live endpoints.
- The **frontend auth is a demo localStorage toggle** (Brand/Creator) — the server-side JWT auth is implemented and tested, but the client does not currently call `/api/auth/*`.
- The **AI Studio page** (`client/src/pages/Studio.tsx`) is a frontend-only mock (local state); the Studio API exists and is tested but is not yet called by the client.
- Media uses CSS poster treatments, so the app never depends on external assets to render.

## Security & hardening

Audit-driven hardening (all covered by `npm test`):
- **CORS** rejects unlisted origins outside `development`; localhost and `CLIENT_ORIGIN` are always allowed.
- **Role escalation blocked**: `/api/auth/register` only accepts `accountType` `Brand` or `Creator` (self-registration as `Admin` → 400).
- **Studio owner-scoping (IDOR fix)**: every per-id project/generation endpoint (`GET/PATCH/DELETE /api/studio/projects/:id`, `GET/DELETE /api/studio/history/:id`, `PATCH .../favourite`) resolves the resource by **id + owner**; cross-owner access → 404.
- **Log hygiene**: the MongoDB connection string is redacted (credentials stripped) before being logged at startup.
- **Cloud reliability**: `serverSelectionTimeoutMS` raised 1500 → 5000 for remote MongoDB.
- **Error responses**: production 5xx responses never leak internal error messages or stacks (full detail in development).
- **Secrets**: `JWT_SECRET` warns loudly in production when unset; see `.env.example` for the full variable list.

## Remaining issues

- **MongoDB path not exercised locally**: tests and the dev instance currently run in memory-fallback mode because no MongoDB is running. The Mongoose model path is implemented but should be verified against a running instance (`npm run seed`, then `npm test`).
- **Vite chunk-size warning**: the production bundle is ~590 kB (minified) and exceeds Vite's default 500 kB warning for a single chunk. Code-splitting (React `lazy`) is the intended follow-up.
- **Studio `generate` is a placeholder** — it records generation metadata with a mock `outputUrl` and does not call a real AI provider.
- **Creator **`creatorName` lookup is exact-match** on the creator display name; engaging a creator whose display name is unknown requires using `ownerEmail` filters.
- **Creator write routes are public** — `POST/PUT/PATCH/DELETE /api/creators/*` have no auth so the demo/directory tooling stays unauthenticated; the read APIs (which the frontend uses) are the intended public surface. Reconcile the demo passwords if you wire the frontend to real auth (`client/src/auth.ts` uses `demo@genra.ai` / `Genra123`; the API seeds `demo1234` / `creator123`).
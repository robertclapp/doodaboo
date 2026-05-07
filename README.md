# Doodaboo

Brutalist project OS with a multi-platform virality predictor.

A single-user Next.js app that combines a Linear-style project and issue
tracker with an in-app social-post composer that scores predicted virality
across eight platforms before you publish, then refreshes the score from
real engagement snapshots after launch.

Everything lives in `localStorage`. There is no backend, no auth, no
network call required to use the product end-to-end. Workspaces are
exportable and importable as JSON.

## Highlights

- **Project tracker** — projects, tasks, issues, status, priority,
  assignees, labels, kanban + list views, command palette, keyboard
  shortcuts.
- **Virality predictor** — hook strength, format-platform fit, posting
  time, retention, share rate per impression. Pure deterministic
  scoring engine you can swap for an ML API later.
- **Playbooks** — 8 curated growth recipes (3-second hook, X funnel,
  founder essay, carousel save-bait, …). Apply to any post and the
  composer previews the score delta before committing.
- **Compare** — up to four posts side-by-side with per-factor bars.
- **Insights** — KPI strip, score-by-platform, day×hour posting-time
  heatmap, factor weakness leaderboard, recommendations roll-up.
- **Dark mode** — CSS-variable tokens, system / light / dark.
- **Mobile** — drawer-style sidebar, full-bleed content.
- **Offline-first** — installable PWA via `manifest.webmanifest`.

## Stack

- Next.js 14 App Router
- React 18, TypeScript strict
- Tailwind CSS with brutalist token palette
- Zustand 4 with `persist` middleware (localStorage)
- Lucide icons, nanoid IDs

## Getting started

```bash
npm install
npm run dev
# http://localhost:3000
```

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Local dev server with hot reload. |
| `npm run build` | Production build. |
| `npm start` | Run the production build. |
| `npm test` | Scoring engine tests via `node:test` + `tsx`. |
| `npm run typecheck` | `tsc --noEmit` across the project. |
| `npm run lint` | `next lint` (ESLint 8). |
| `npm run format` | Prettier write across `src/`. |
| `npm run verify` | Typecheck + lint + tests in one shot. |

## Deploying to Vercel

The repo includes a `vercel.json` with sensible security headers
(`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`).

```bash
# one-time
vercel link
vercel env add NEXT_PUBLIC_SITE_URL production    # https://doodaboo.com (or your domain)

# deploy
vercel --prod
```

`NEXT_PUBLIC_SITE_URL` is used by `app/sitemap.ts`, `app/robots.ts`,
`app/manifest.ts`, and the metadata `metadataBase`. Defaulting it lets
preview deploys work without configuration.

## Architecture

### Domain

| Concept | File |
| --- | --- |
| Domain types | `src/lib/types.ts` |
| Persistent store | `src/lib/store.ts` (zustand + localStorage) |
| Seed data | `src/lib/seed.ts` (deterministic, SSR-safe) |
| Scoring engine | `src/lib/virality.ts` |
| Playbooks | `src/lib/playbooks.ts` |
| Theme | `src/lib/store.ts` (`Theme` type) + `src/app/globals.css` |

### App Router surfaces

```
src/app/
├── layout.tsx              # global metadata, theme bootstrap, AppShell
├── error.tsx               # per-route error boundary (brutalist card)
├── global-error.tsx        # last-resort full-page boundary
├── loading.tsx             # global loading fallback
├── not-found.tsx           # 404 page
├── opengraph-image.tsx     # 1200×630 OG image (edge runtime)
├── icon.tsx, apple-icon.tsx
├── sitemap.ts, robots.ts, manifest.ts
├── page.tsx                # dashboard
├── inbox/, my-issues/      # personal queues
├── projects/               # list, detail (kanban/list), new
│   └── [projectId]/tasks/[taskId]/
├── posts/                  # composer + virality predictor
│   ├── new/, [postId]/
│   ├── compare/            # up to 4 lanes via ?ids=…
│   └── insights/           # cross-post benchmark
├── playbooks/              # library + detail
├── team/, labels/, settings/
```

### Hydration

The store uses `skipHydration: true` and an explicit
`useStore.persist.rehydrate()` call from `<StoreHydration>`. The first
client render matches SSR (`hydrated=false` → null bodies), then the
client loads `localStorage` and re-renders. Seeds use a fixed `EPOCH`
date (no `Date.now()`) to keep SSR and CSR identical before hydration.

### Theme

Light/dark/system theme is persisted in zustand. `<ThemeManager>` sets
`data-theme="…"` on `<html>`; an inline bootstrap script in
`layout.tsx` does the same before React mounts to avoid a light-mode
flash. Color tokens are CSS variables so the swap is instant and
covers third-party SVGs via `currentColor`.

### Scoring engine

`scoreIntrinsic(post)` + `scoreLive(post)` are pure functions. Each
returns `{ value, band, confidence, factors[], computedAt }` with
factors carrying `{ raw, weight, contribution, hint }`. The blend
between intrinsic and live signals scales with snapshot age so noisy
early data doesn't dominate. Tests in `src/lib/virality.test.ts` cover
determinism, weight normalization, blend behavior, recommendation
sorting, and threshold projection monotonicity.

### Project structure for new contributors

1. Domain change? edit `types.ts`, then the store, then surface UI.
2. New page? add a route under `src/app/`. Use `useHydrated()` for any
   page that reads from the store.
3. Long-lived primitive? add to `src/components/ui/`. Feature-specific
   widgets live under `src/components/posts/` etc.
4. Run `npm run verify` before pushing.

## Roadmap

- Real backend (Supabase or Convex) so workspaces sync across devices.
- Auth.
- Real-time collaboration.
- Migrate seed posts behind a feature flag for fresh accounts.
- Playwright E2E suite covering the post-create → score → snapshot
  loop.
- Replace heuristic scoring with a fine-tuned model fed by historical
  post telemetry.

## Licence

Private project — no licence granted.

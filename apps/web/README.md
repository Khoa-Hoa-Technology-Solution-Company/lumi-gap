# Web — Publication Trend System

React 18 + Vite + TypeScript + Tailwind + shadcn/ui.

## Quick start

```bash
# from repo root
pnpm install
cp apps/web/.env.example apps/web/.env
pnpm dev:web                   # http://localhost:5173
```

The dev server proxies `/api` → `http://localhost:4000` so you don't need CORS in dev.

## Add a shadcn component

```bash
cd apps/web
pnpm dlx shadcn@latest add button card input form dialog
```

Components land under `src/components/ui/`.

## Layout (feature-based)

```
src/
├── main.tsx                providers: QueryClient + Router → renders <App/>
├── App.tsx                 mounts <AppRoutes/>
├── vite-env.d.ts
├── assets/                 images, fonts, icons (`import logo from "@/assets/..."`)
├── components/             shared UI building blocks (PaperCard, EmptyState, …)
│   └── ui/                 shadcn primitives (generated)
├── constants/
│   └── api.ts              centralised backend route paths
├── features/               feature modules — each self-contained
│   ├── auth/
│   │   ├── api/auth.api.ts         HTTP calls (login, register, refresh, …)
│   │   ├── hooks/use-auth.ts       useLogin, useRegister, useLogout, useCurrentUser
│   │   ├── schemas/auth.schemas.ts Zod form schemas
│   │   ├── components/             LoginForm, RegisterForm (TODO)
│   │   └── index.ts                public API (import from here only)
│   ├── papers/                     api/, hooks/, components/
│   ├── search/                     (TODO)
│   ├── trends/                     (TODO)
│   ├── reports/                    (TODO)
│   └── bookmarks/                  (TODO)
├── hooks/                  app-wide hooks (useDebounce, useMediaQuery, …)
├── layouts/                MainLayout, AuthLayout
├── pages/                  route components (one per URL)
├── routes/
│   └── app-routes.tsx      <Routes/> table with nested layouts
├── services/
│   ├── api-client.ts       axios + JWT refresh-on-401
│   └── query-client.ts     react-query defaults
├── stores/
│   └── auth-store.ts       zustand persisted to localStorage
├── theme/
│   └── globals.css         Tailwind layers + shadcn CSS vars
└── utils/                  pure helpers
    ├── cn.ts               shadcn className combinator
    └── format.ts           formatNumber, formatCitations, getYear
```

## Conventions

- **Import features only via their `index.ts`** — never reach into `features/auth/hooks/use-auth` directly from a page.
- **`pages/`** = route components (thin). **`features/<name>/components/`** = actual UI.
- **`@/...`** alias maps to `src/...` (see `tsconfig.app.json` and `vite.config.ts`).
- **Shared types** from `@trend/shared-types` — Paper, User, AuthTokens, Report.

## Adding a new feature

1. `src/features/<name>/api/<name>.api.ts` — HTTP calls
2. `src/features/<name>/hooks/use-<name>.ts` — react-query wrappers
3. `src/features/<name>/components/<X>.tsx` — UI specific to this feature
4. `src/features/<name>/index.ts` — re-export the public API
5. Create a thin `src/pages/<page>.tsx` that imports from the feature
6. Add route in `src/routes/app-routes.tsx`

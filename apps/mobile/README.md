# Mobile — Publication Trend System

Expo SDK 52 + React Native + TypeScript + Expo Router + NativeWind.

## Quick start

```bash
# from repo root
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
pnpm dev:mobile                # opens Expo dev tools
```

Then:
- Press **`a`** for Android emulator (needs Android Studio installed)
- Press **`i`** for iOS simulator (Mac only)
- Or scan the QR code with **Expo Go** on your phone

## Why these files

- **[metro.config.js](metro.config.js)** — pnpm hoists deps differently from npm/yarn. Without the `watchFolders` and `nodeModulesPaths` tweaks, Metro will throw "Unable to resolve module" for `@trend/shared-types`.
- **[babel.config.js](babel.config.js)** — wires up `nativewind/babel` and tells Babel to use `nativewind` as the JSX import source so `className` works on RN components.
- **[src/theme/globals.css](src/theme/globals.css)** — Tailwind entry, imported once in `app/_layout.tsx`.

## Layout

Two top-level folders work together:

- **`app/`** — Expo Router file-based routes. Required to live at this exact path.
- **`src/`** — everything else (feature modules, services, components). Imported via `@/...` alias.
- **`assets/`** — Expo icon/splash assets. Required at the root for `app.json` to find them.

```
app/                        Expo Router routes (FILE-BASED ROUTING)
├── _layout.tsx             root providers (QueryClient, GestureHandler, SafeArea)
├── index.tsx               home screen
├── (tabs)/                 tab group (TODO)
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── search.tsx
│   ├── bookmarks.tsx
│   └── profile.tsx
├── (auth)/                 auth group (TODO)
│   ├── login.tsx
│   └── register.tsx
└── paper/[id].tsx          paper detail (TODO)

src/                        non-route code
├── components/             reusable UI (PaperCard, ListItem, EmptyState)
├── constants/api.ts        centralised backend route paths
├── features/               feature modules
│   ├── auth/               api/, hooks/, index.ts
│   ├── papers/             api/, hooks/, index.ts
│   ├── search/             (TODO)
│   ├── bookmarks/          (TODO)
│   └── notifications/      (TODO) expo-notifications
├── hooks/                  shared hooks
├── layouts/                screen wrappers
├── services/
│   ├── api-client.ts       axios with auto-resolving dev host + JWT refresh
│   └── query-client.ts     react-query defaults (more retries on mobile)
├── stores/
│   └── auth-store.ts       zustand persisted to expo-secure-store
├── theme/
│   ├── globals.css         Tailwind entry (referenced by metro.config.js)
│   └── colors.ts           color tokens for non-className use (StatusBar, etc.)
└── utils/format.ts         formatCitations, formatNumber, getYear

assets/                     Expo icons, splash images (referenced by app.json)
```

## Conventions

- `@/...` alias resolves to `src/...` (see `tsconfig.json`).
- Routes in `app/` import from features via `@/features/<name>`.
- NativeWind classes work on RN components because Babel config sets `jsxImportSource: "nativewind"`.

## Adding a new screen

1. Create the route file in `app/`, e.g. `app/(tabs)/profile.tsx`.
2. Put real UI in `src/features/<feature>/components/<Screen>.tsx`.
3. Keep the route file thin — just a wrapper that renders the feature component.

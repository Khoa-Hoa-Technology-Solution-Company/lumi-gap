// Root .env uses NODE_ENV=development for the native backend. Set this before
// importing Vite so a web production build never inherits React's dev runtime.
process.env.NODE_ENV = "production";
const { build } = await import("vite");
await build();
await import("./check-bundle-budget.mjs");

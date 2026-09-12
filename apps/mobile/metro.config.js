// Metro config for Expo inside a pnpm mono-repo.
//
// Two non-default things matter here:
//   1. `watchFolders` so Metro notices changes in workspace packages like
//      `@trend/shared-types` outside this app's directory.
//   2. `nodeModulesPaths` + `disableHierarchicalLookup: true` so the bundler
//      can resolve hoisted deps from the repo-root `node_modules`.
//
// Also wires up NativeWind v4 with the Tailwind entry in src/theme/.

const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: "./src/theme/globals.css" });

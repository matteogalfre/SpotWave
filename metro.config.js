// Metro config for the SpotWave monorepo.
//
// The native app lives at the repo root and consumes the shared, platform-
// agnostic logic in `packages/core`. Rather than relying on workspace symlinks
// (fragile with Metro on some setups), we alias `@spotwave/core` straight to the
// package source and add it to `watchFolders` so Metro transpiles the TS and
// hot-reloads on change. The web app (apps/web) consumes the same package via
// its own bundler config.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const coreSrc = path.resolve(projectRoot, 'packages/core/src');

config.watchFolders = [...(config.watchFolders || []), coreSrc];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@spotwave/core': coreSrc,
};

module.exports = config;

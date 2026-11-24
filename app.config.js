// Settings that must not live in the repo come from the environment: a .env.local file when
// running locally, EAS environment variables for store builds, Netlify settings for the web build.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    // CARTO basemap key. Optional: without it the map still works, with watermarked tiles.
    cartoApiKey: process.env.CARTO_API_KEY ?? '',
  },
});

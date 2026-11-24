# SpotWave

Surf forecasts boiled down to one score. SpotWave blends swell, wind, period and the orientation of each beach into a score from 0 to 10, for every spot and every hour, so you can tell at a glance whether it's worth paddling out.

<p>
  <img src="docs/screenshots/home.jpg" width="200" alt="Home screen with the best spots near you">
  <img src="docs/screenshots/spot.jpg" width="200" alt="A spot with its hour-by-hour score">
  <img src="docs/screenshots/swell-wind.jpg" width="200" alt="Swell and wind details">
  <img src="docs/screenshots/map.jpg" width="200" alt="Map of spots with their live score">
</p>

**[Get it on Google Play](https://play.google.com/store/apps/details?id=com.spotwave.app)**

## Features

- One score per spot and per hour, from 0 to 10, with a breakdown of what drives it
- Swell (height, period, direction), wind (speed, gusts, offshore or onshore), tides, water and air temperature
- Hour-by-hour forecast up to 10 days ahead
- 370+ spots worldwide on an interactive map, also available offline
- Favorites, alerts with your own threshold per spot, and a weekly "best slot" summary
- Search by spot, region or country, and suggest a missing spot from the app
- 7 languages: English, French, Spanish, Portuguese, German, Italian, Japanese
- Free, no ads, no account, no tracking. Location is optional and never leaves your phone

## How the score works

Forecasts come from the [Open-Meteo](https://open-meteo.com) marine and weather APIs (free, no API key). The score lives in [`src/utils/scoring.ts`](src/utils/scoring.ts): swell height and period set the potential, the wind direction relative to the beach's orientation (offshore, cross, onshore) and its strength adjust it, and your surfer profile tunes it. Every factor is a smooth function, so the score doesn't jump from one hour to the next. Tests in `src/__tests__/` check that well-known sea states land in the same band as the ratings of established surf forecasters.

## Run it locally

```bash
npm install
npx expo start      # Android, iOS or web
npm test            # scoring, tides, search and digest tests
npm run build:web   # PWA build in dist/
```

Android release builds go through EAS (`eas.json`). For local signing, copy `credentials.json.example` to `credentials.json` and fill it in: it is git-ignored.

## Contributing

Issues and pull requests are welcome. The easiest way to help:

- **Spots:** add a missing spot or fix one (position, orientation, webcam) in [`src/data/spots.ts`](src/data/spots.ts)
- **Translations:** improve a language in [`src/i18n/`](src/i18n/) or add a new one
- **Score:** if the score feels off for a spot you know well, open an issue with the date, the spot and what the conditions really were

## License

[GPL-3.0](LICENSE). Forecast data by [Open-Meteo](https://open-meteo.com), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

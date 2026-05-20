# ScoutFootball

ScoutFootball is an Expo React Native football analysis app backed by the Render-hosted ScoutFootball API.

## Development

```bash
npm install
npx expo start
```

Local API/staging overrides can be supplied with Expo public env vars:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_FOOTBALL_SEASON=2025
```

## Checks

```bash
npm run lint
.\node_modules\.bin\tsc.cmd --noEmit --skipLibCheck
```

## Production Build

The app is configured for EAS production builds with Android package and iOS bundle ID:

```txt
com.umutnuray.scoutfootball
```

Build only:

```bash
eas build --profile production --platform all
```

Build and submit after Google Play Console / App Store Connect credentials are ready:

```bash
eas build --profile production --platform all --auto-submit
```

## Backend

Render runs the `ScoutFootball-Backend` service from this repository with `npm start`. Required service variables are documented in `ScoutFootball-Backend/.env.example`.
Diagnostic endpoints such as `/push/status` require `DIAGNOSTICS_SECRET` via the `x-diagnostics-secret` header.

# ScoutFootball

ScoutFootball is an Expo React Native football analysis app backed by the Railway-hosted ScoutFootball API.

## Development

```bash
npm install
npx expo start
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

Railway uses the `ScoutFootball-Backend` directory from this repository. Required service variables are documented in `ScoutFootball-Backend/.env.example`.

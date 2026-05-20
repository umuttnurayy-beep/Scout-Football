import Constants from 'expo-constants';

const DEFAULT_PROD_API_BASE_URL = 'https://scout-football-backend.onrender.com';
const LOCAL_API_BASE_URL = 'http://localhost:3000';

function readExtraString(key: string): string | undefined {
  const value = Constants.expoConfig?.extra?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  readExtraString('apiBaseUrl') ||
  (__DEV__ ? LOCAL_API_BASE_URL : DEFAULT_PROD_API_BASE_URL);

export const CURRENT_FOOTBALL_SEASON =
  Number(process.env.EXPO_PUBLIC_FOOTBALL_SEASON || readExtraString('footballSeason')) || 2025;

export const DISPLAY_FOOTBALL_SEASON =
  readExtraString('displayFootballSeason') || '2025/26';

export const CURRENT_SPORTSDB_SEASON =
  readExtraString('sportsDbSeason') || '2025-2026';

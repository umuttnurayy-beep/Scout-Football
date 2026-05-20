import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { API_BASE_URL } from './config';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifPrefs = {
  daily: boolean;    // "Bugünün analizleri hazır" — saat 12:00
  favTeam: boolean;  // Favori + watchlist takımları, maçtan 30 dk önce
  featured: boolean; // Günün öne çıkan maçı — saat 12:00
};

export type WatchedMatch = {
  home: string;
  away: string;
  time: string; // "HH:mm" formatında
  date?: string; // "YYYY-MM-DD" — sağlanırsa sadece o gün bildirim zamanlanır
};

export type NotifData = {
  matchCount: number;
  scoutPick?: { home: string; away: string };
  watchedMatches: WatchedMatch[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PREFS_KEY    = 'scout_notif_prefs_v2';
const DAILY_ID     = 'scout_daily';
const FEATURED_ID  = 'scout_featured';
const MATCH_PREFIX = 'scout_match_';
const SCOUT_NOTIFICATION_IDS = [DAILY_ID, FEATURED_ID];
const BASE_URL     = API_BASE_URL;
const DAILY_NOTIFICATION_HOUR = 12;

export const DEFAULT_PREFS: NotifPrefs = {
  daily: false, favTeam: false, featured: false,
};

// ── Notification handler (called at module load) ───────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ── Prefs persistence ─────────────────────────────────────────────────────────

export async function loadNotifPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function saveNotifPrefs(prefs: NotifPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// ── Permissions ───────────────────────────────────────────────────────────────

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Scout Bildirimleri',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function cancelAllNotifications(): Promise<void> {
  await cancelScoutNotifications();
}

async function cancelScoutNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(n => SCOUT_NOTIFICATION_IDS.includes(n.identifier) || n.identifier.startsWith(MATCH_PREFIX))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export async function registerPushToken(
  prefs: NotifPrefs,
  watchedTeams: string[],
): Promise<void> {
  try {
    const anyEnabled = prefs.daily || prefs.favTeam || prefs.featured;
    if (!anyEnabled) return;

    const granted = await requestPermissions();
    if (!granted) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await fetch(`${BASE_URL}/register-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tokenResult.data,
        prefs,
        watchedTeams,
      }),
    });
  } catch (e) {
    console.error('registerPushToken hata:', e);
  }
}

// ── Time helpers ──────────────────────────────────────────────────────────────

// Bugünün saat 12:00'ine kadar saniye — geçtiyse null döner
function secondsUntilTodayNoon(): number | null {
  const now = new Date();
  const noon = new Date();
  noon.setHours(DAILY_NOTIFICATION_HOUR, 0, 0, 0);
  const diff = Math.floor((noon.getTime() - now.getTime()) / 1000);
  return diff > 30 ? diff : null;
}

// Maçtan minutesBefore dk önceye kadar saniye — geçtiyse veya bugün değilse null döner
function secondsUntilReminder(timeStr: string, minutesBefore: number, matchDate?: string): number | null {
  const now = new Date();
  if (matchDate) {
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (matchDate !== todayStr) return null;
  }
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  const matchTime = new Date();
  matchTime.setHours(h, m, 0, 0);
  const reminderTime = new Date(matchTime.getTime() - minutesBefore * 60 * 1000);
  const diff = Math.floor((reminderTime.getTime() - now.getTime()) / 1000);
  return diff > 30 ? diff : null;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export async function scheduleNotifications(
  data: NotifData,
  prefs: NotifPrefs,
): Promise<void> {
  const anyEnabled = prefs.daily || prefs.favTeam || prefs.featured;

  if (!anyEnabled) {
    await cancelScoutNotifications();
    return;
  }

  const granted = await requestPermissions();
  if (!granted) return;

  // Mevcut maç hatırlatmalarını iptal et, yeniden planla
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(MATCH_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  // 1. Günlük analiz — bugünün 12:00'ine one-time, maç yoksa zamanlanmaz
  await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
  if (prefs.daily && data.matchCount > 0) {
    const secs = secondsUntilTodayNoon();
    if (secs !== null) {
      let body = `Bugün ${data.matchCount} maç var.`;
      if (data.scoutPick) {
        body = `${data.matchCount} maç · ${data.scoutPick.home} - ${data.scoutPick.away} öne çıkıyor`;
      }
      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_ID,
        content: { title: 'Bugünün analizleri hazır ⚽', body, sound: false },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secs,
        },
      });
    }
  }

  // 2. Öne çıkan maç — bugünün 12:00'ine one-time, yalnızca daily kapalıysa ve maç varsa
  await Notifications.cancelScheduledNotificationAsync(FEATURED_ID);
  if (prefs.featured && !prefs.daily && data.scoutPick && data.matchCount > 0) {
    const secs = secondsUntilTodayNoon();
    if (secs !== null) {
      const { home, away } = data.scoutPick;
      await Notifications.scheduleNotificationAsync({
        identifier: FEATURED_ID,
        content: {
          title: 'Günün öne çıkan maçı ⭐',
          body: `${home} - ${away} · Scout analizini incele`,
          sound: false,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secs,
        },
      });
    }
  }

  // 3. Maç hatırlatması — maçtan 30 dk önce (favori + watchlist)
  if (prefs.favTeam) {
    for (const wm of data.watchedMatches) {
      const secs = secondsUntilReminder(wm.time, 30, wm.date);
      if (secs === null) continue;
      const id = `${MATCH_PREFIX}${wm.home}_${wm.away}`.replace(/\s+/g, '_').slice(0, 64);
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: '⚽ Maç başlamak üzere!',
          body: `${wm.home} - ${wm.away} · 30 dakika kaldı`,
          sound: false,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secs,
        },
      });
    }
  }
}

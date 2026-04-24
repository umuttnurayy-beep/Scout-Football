import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifPrefs = {
  daily: boolean;    // "Bugünün analizleri hazır"
  favTeam: boolean;  // Favori takım oynuyor
  featured: boolean; // Günün öne çıkan maçı
  risky: boolean;    // Riskli maç uyarısı
};

export type NotifData = {
  matchCount: number;
  scoutPick?: { home: string; away: string };
  favTeamMatch?: { home: string; away: string; time: string };
  riskyMatch?: { home: string; away: string };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PREFS_KEY    = 'scout_notif_prefs_v1';
const LAST_DATE_KEY = 'scout_notif_last_date';

export const DEFAULT_PREFS: NotifPrefs = {
  daily: false, favTeam: false, featured: false, risky: false,
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
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function resetScheduleDate(): Promise<void> {
  await AsyncStorage.removeItem(LAST_DATE_KEY);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Seconds until chosen hour today — if already passed, returns 5 (fire immediately)
function secondsUntilHour(hour: number): number {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, 0, 0, 0);
  const diff = Math.floor((target.getTime() - now.getTime()) / 1000);
  return diff > 10 ? diff : 5;
}

export async function scheduleNotifications(
  data: NotifData,
  prefs: NotifPrefs,
): Promise<void> {
  const anyEnabled = prefs.daily || prefs.favTeam || prefs.featured || prefs.risky;
  if (!anyEnabled) return;

  // Don't reschedule if already done today
  const lastDate = await AsyncStorage.getItem(LAST_DATE_KEY);
  if (lastDate === todayStr()) return;

  const granted = await requestPermissions();
  if (!granted) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const base = secondsUntilHour(10);
  let offset = 0;

  // 1. Günlük analiz bildirimi
  if (prefs.daily) {
    let body = `Bugün ${data.matchCount} maç var.`;
    if (data.scoutPick) {
      body = `${data.matchCount} maç · ${data.scoutPick.home} - ${data.scoutPick.away} öne çıkıyor`;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Bugünün analizleri hazır ⚽', body, sound: false },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: base + offset,
      },
    });
    offset += 3;
  }

  // 2. Öne çıkan maç (sadece daily kapalıysa ayrı bildirim olarak gönder)
  if (prefs.featured && !prefs.daily && data.scoutPick) {
    const { home, away } = data.scoutPick;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Günün öne çıkan maçı',
        body: `${home} - ${away} · Scout analizini incele`,
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: base + offset,
      },
    });
    offset += 3;
  }

  // 3. Favori takım oynuyor
  if (prefs.favTeam && data.favTeamMatch) {
    const { home, away, time } = data.favTeamMatch;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⭐ Favori takımın bugün oynuyor!',
        body: `${home} - ${away} · ${time}`,
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: base + offset,
      },
    });
    offset += 3;
  }

  // 4. Riskli maç uyarısı
  if (prefs.risky && data.riskyMatch) {
    const { home, away } = data.riskyMatch;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Riskli maç uyarısı',
        body: `${home} - ${away} · Sürpriz senaryoya açık, dikkatle değerlendirin`,
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: base + offset,
      },
    });
  }

  await AsyncStorage.setItem(LAST_DATE_KEY, todayStr());
}

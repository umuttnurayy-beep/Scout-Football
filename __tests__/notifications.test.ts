jest.mock('../services/config', () => ({
  API_BASE_URL: 'https://example.test',
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
  easConfig: { projectId: 'test-project-id' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 'default' },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import { scheduleNotifications, type NotifPrefs } from '../services/notifications';

const notificationsMock = Notifications as unknown as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getAllScheduledNotificationsAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
};

describe('scheduleNotifications', () => {
  const prefs: NotifPrefs = { daily: false, favTeam: true, featured: false };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-01T10:00:00'));
    jest.clearAllMocks();
    notificationsMock.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    notificationsMock.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    notificationsMock.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    notificationsMock.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
    notificationsMock.scheduleNotificationAsync.mockResolvedValue('scheduled-id');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules reminders only for today when match dates are provided', async () => {
    await scheduleNotifications({
      matchCount: 2,
      watchedMatches: [
        { home: 'Galatasaray', away: 'Fenerbahce', time: '20:00', date: '2026-05-01' },
        { home: 'Besiktas', away: 'Trabzonspor', time: '20:00', date: '2026-05-02' },
      ],
    }, prefs);

    expect(notificationsMock.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(notificationsMock.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'scout_match_Galatasaray_Fenerbahce',
        content: expect.objectContaining({
          body: 'Galatasaray - Fenerbahce · 30 dakika kaldı',
        }),
      }),
    );
  });

  it('keeps scheduling undated reminders and clears old match reminders first', async () => {
    notificationsMock.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'scout_match_old_fixture' },
      { identifier: 'scout_daily' },
    ]);

    await scheduleNotifications({
      matchCount: 1,
      watchedMatches: [
        { home: 'Eyupspor', away: 'Kasimpasa', time: '19:30' },
      ],
    }, prefs);

    expect(notificationsMock.cancelScheduledNotificationAsync).toHaveBeenCalledWith('scout_match_old_fixture');
    expect(notificationsMock.cancelScheduledNotificationAsync).toHaveBeenCalledWith('scout_daily');
    expect(notificationsMock.cancelScheduledNotificationAsync).toHaveBeenCalledWith('scout_featured');
    expect(notificationsMock.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(notificationsMock.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'scout_match_Eyupspor_Kasimpasa',
      }),
    );
  });
});

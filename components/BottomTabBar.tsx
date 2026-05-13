import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

export type ActiveTab = 'matches' | 'leagues' | 'stats' | 'profile';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { key: ActiveTab; label: string; icon: IoniconName; activeIcon: IoniconName; route: Href }[] = [
  { key: 'matches',  label: 'Maçlar',     icon: 'football-outline',    activeIcon: 'football',    route: '/' },
  { key: 'leagues',  label: 'Ligler',     icon: 'trophy-outline',      activeIcon: 'trophy',      route: '/leagues' },
  { key: 'stats',    label: 'İstatistik', icon: 'stats-chart-outline', activeIcon: 'stats-chart', route: '/stats' },
  { key: 'profile',  label: 'Profil',     icon: 'person-outline',      activeIcon: 'person',      route: '/profile' },
];

export default function BottomTabBar({ activeTab }: { activeTab: ActiveTab }) {
  const router = useRouter();
  const { colors: c, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[
      styles.tabBar,
      {
        backgroundColor: c.surface,
        paddingBottom: Math.max(12, insets.bottom),
        shadowColor: isDark ? '#000' : '#000',
        shadowOpacity: isDark ? 0.4 : 0.08,
      },
    ]}>
      {TABS.map(tab => {
        const isActive = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            activeOpacity={0.7}
            onPress={() => { if (!isActive) router.push(tab.route); }}
          >
            <View style={[styles.iconWrap, isActive && { backgroundColor: c.primaryLight }]}>
              <Ionicons
                name={isActive ? tab.activeIcon : tab.icon}
                size={22}
                color={isActive ? c.primary : c.textMuted}
              />
            </View>
            <Text style={[styles.tabText, { color: isActive ? c.primary : c.textMuted }, isActive && styles.tabActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 12,
    elevation: 12,
  },
  tab:      { flex: 1, paddingTop: 10, paddingBottom: 2, alignItems: 'center', justifyContent: 'center', gap: 4 },
  iconWrap: { width: 48, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tabText:  { fontSize: 11, letterSpacing: 0.1 },
  tabActive: { fontWeight: '600' },
});

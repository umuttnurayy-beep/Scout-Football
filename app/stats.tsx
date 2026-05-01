import { useRouter } from 'expo-router';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BottomTabBar from '../components/BottomTabBar';
import { useTheme } from '../context/ThemeContext';

type Stil = 'Hücumcu' | 'Savunmacı' | 'Dengeli';

const leagues = [
  {
    id: 1, apiId: 39,  fdId: 2021,
    name: 'Premier Lig', country: 'İngiltere', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    stil: 'Dengeli' as Stil,
    desc: 'En rekabetçi lig · Tempo: Yüksek',
  },
  {
    id: 2, apiId: 140, fdId: 2014,
    name: 'La Liga',     country: 'İspanya',   flag: '🇪🇸',
    stil: 'Savunmacı' as Stil,
    desc: 'Taktik ağırlıklı · Gol: Orta',
  },
  {
    id: 3, apiId: 78,  fdId: 2002,
    name: 'Bundesliga',  country: 'Almanya',   flag: '🇩🇪',
    stil: 'Hücumcu' as Stil,
    desc: 'En golcü büyük lig · Tempo: Yüksek',
  },
  {
    id: 4, apiId: 135, fdId: 2019,
    name: 'Serie A',     country: 'İtalya',    flag: '🇮🇹',
    stil: 'Savunmacı' as Stil,
    desc: 'Savunma disiplini · Gol: Düşük',
  },
  {
    id: 5, apiId: 61,  fdId: 2015,
    name: 'Ligue 1',     country: 'Fransa',    flag: '🇫🇷',
    stil: 'Dengeli' as Stil,
    desc: 'Sürpriz oranı yüksek · Risk: Yüksek',
  },
  {
    id: 6, apiId: 2,   fdId: 2001,
    name: 'UCL',         country: 'Avrupa',    flag: '🌍',
    stil: 'Dengeli' as Stil,
    desc: 'Avrupa\'nın zirvesi · Elitler ligi',
  },
  {
    id: 7, apiId: 203, fdId: 0,
    name: 'Süper Lig',   country: 'Türkiye',   flag: '🇹🇷',
    stil: 'Dengeli' as Stil,
    desc: 'Rekabetçi yapı · Tempo: Yüksek',
  },
];

function stilBadgeColors(stil: Stil, isDark: boolean) {
  if (stil === 'Hücumcu')   return { color: isDark ? '#F85149' : '#A32D2D', bg: isDark ? '#2C0A0A' : '#FDECEA' };
  if (stil === 'Savunmacı') return { color: isDark ? '#3FB950' : '#1B5E20', bg: isDark ? '#0D2010' : '#E8F5E9' };
  return                           { color: isDark ? '#79AAFF' : '#0C447C', bg: isDark ? '#0A1929' : '#E6F1FB' };
}

export default function StatsScreen() {
  const router = useRouter();
  const { colors: c, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={[styles.topbar, { backgroundColor: c.surface }]}>
        <View style={styles.headerBrand}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        </View>
        <Text style={[styles.pageTitle, { color: c.textMuted }]}>İstatistik</Text>
      </View>

      <ScrollView style={styles.scroll}>
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>LİG SEÇ</Text>
        {leagues.map(l => {
          const badge = stilBadgeColors(l.stil, isDark);
          return (
            <TouchableOpacity
              key={l.id}
              style={[styles.leagueItem, { borderBottomColor: c.border, backgroundColor: c.surface }]}
              onPress={() => router.push({
                pathname: '/team_detail',
                params: { leagueName: l.name, leagueFlag: l.flag, fdId: l.fdId, apiId: l.apiId },
              })}>
              <Text style={styles.leagueFlag}>{l.flag}</Text>
              <View style={styles.leagueInfo}>
                <View style={styles.leagueNameRow}>
                  <Text style={[styles.leagueName, { color: c.text }]}>{l.name}</Text>
                  <View style={[styles.stilBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.stilBadgeText, { color: badge.color }]}>{l.stil}</Text>
                  </View>
                </View>
                <Text style={[styles.leagueCountry, { color: c.textMuted }]}>{l.country}</Text>
                <Text style={[styles.leagueDesc, { color: c.textFaint }]}>{l.desc}</Text>
              </View>
              <Text style={[styles.arrow, { color: c.textVeryFaint }]}>›</Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 30 }} />
      </ScrollView>

      <BottomTabBar activeTab="stats" />
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  topbar:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8 },
  headerBrand:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogo:     { width: 42, height: 42, resizeMode: 'contain' },
  appName:        { fontSize: 16, fontWeight: '600', color: '#00BAFF' },
  appNameBlue:    { color: '#2563EB' },
  pageTitle:      { fontSize: 13 },
  scroll:         { flex: 1 },
  sectionLabel:   { fontSize: 11, fontWeight: '500', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, letterSpacing: 0.5 },
  leagueItem:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, gap: 12 },
  leagueFlag:     { fontSize: 28 },
  leagueInfo:     { flex: 1 },
  leagueNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leagueName:     { fontSize: 15, fontWeight: '500' },
  stilBadge:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  stilBadgeText:  { fontSize: 11, fontWeight: '500' },
  leagueCountry:  { fontSize: 12, marginTop: 2 },
  leagueDesc:     { fontSize: 11, marginTop: 2 },
  arrow:          { fontSize: 18 },
});

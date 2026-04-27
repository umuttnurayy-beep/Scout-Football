import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const leagues = [
  { id: 1, apiId: 39,  fdId: 2021, name: 'Premier Lig', country: 'İngiltere', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 2, apiId: 140, fdId: 2014, name: 'La Liga',     country: 'İspanya',   flag: '🇪🇸' },
  { id: 3, apiId: 78,  fdId: 2002, name: 'Bundesliga',  country: 'Almanya',   flag: '🇩🇪' },
  { id: 4, apiId: 135, fdId: 2019, name: 'Serie A',     country: 'İtalya',    flag: '🇮🇹' },
  { id: 5, apiId: 61,  fdId: 2015, name: 'Ligue 1',     country: 'Fransa',    flag: '🇫🇷' },
  { id: 6, apiId: 2,   fdId: 2001, name: 'UCL',         country: 'Avrupa',    flag: '🌍' },
  { id: 7, apiId: 4481, fdId: 0,   name: 'Europa Lig',  country: 'Avrupa',    flag: '🇪🇺' },
  { id: 8, apiId: 203, fdId: 0,    name: 'Süper Lig',   country: 'Türkiye',   flag: '🇹🇷' },
];

export default function StatsScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();

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
        {leagues.map(l => (
          <TouchableOpacity key={l.id} style={[styles.leagueItem, { borderBottomColor: c.border, backgroundColor: c.surface }]}
            onPress={() => router.push({
              pathname: '/team_detail',
              params: { leagueName: l.name, leagueFlag: l.flag, fdId: l.fdId, apiId: l.apiId },
            })}>
            <Text style={styles.leagueFlag}>{l.flag}</Text>
            <View style={styles.leagueInfo}>
              <Text style={[styles.leagueName, { color: c.text }]}>{l.name}</Text>
              <Text style={[styles.leagueCountry, { color: c.textMuted }]}>{l.country}</Text>
            </View>
            <Text style={[styles.arrow, { color: c.textVeryFaint }]}>›</Text>
          </TouchableOpacity>
        ))}
        <View style={{ height: 30 }} />
      </ScrollView>

      <View style={[styles.tabBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/')}>
          <Ionicons name="football-outline" size={22} color={c.textMuted} />
          <Text style={[styles.tabText, { color: c.textMuted }]}>Maçlar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/leagues')}>
          <Ionicons name="trophy-outline" size={22} color={c.textMuted} />
          <Text style={[styles.tabText, { color: c.textMuted }]}>Ligler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab}>
          <Ionicons name="stats-chart" size={22} color={c.primary} />
          <Text style={[styles.tabText, styles.tabActive, { color: c.primary }]}>İstatistik</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/profile')}>
          <Ionicons name="person-outline" size={22} color={c.textMuted} />
          <Text style={[styles.tabText, { color: c.textMuted }]}>Profil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  topbar:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8 },
  headerBrand:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogo:   { width: 42, height: 42, resizeMode: 'contain' },
  appName:      { fontSize: 16, fontWeight: '600', color: '#00BAFF' },
  appNameBlue:  { color: '#2563EB' },
  pageTitle:    { fontSize: 13 },
  scroll:       { flex: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '500', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, letterSpacing: 0.5 },
  leagueItem:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 0.5, gap: 12 },
  leagueFlag:   { fontSize: 28 },
  leagueInfo:   { flex: 1 },
  leagueName:   { fontSize: 15, fontWeight: '500' },
  leagueCountry:{ fontSize: 12, marginTop: 2 },
  arrow:        { fontSize: 18 },
  tabBar:       { flexDirection: 'row', borderTopWidth: 0.5, paddingBottom: 20 },
  tab:          { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabText:      { fontSize: 12 },
  tabActive:    { fontWeight: '500' },
});

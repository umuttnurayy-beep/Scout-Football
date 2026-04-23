import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const leagues = [
  { id: 1, apiId: 39,  fdId: 2021, name: 'Premier Lig', country: 'İngiltere', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 2, apiId: 140, fdId: 2014, name: 'La Liga',     country: 'İspanya',   flag: '🇪🇸' },
  { id: 3, apiId: 78,  fdId: 2002, name: 'Bundesliga',  country: 'Almanya',   flag: '🇩🇪' },
  { id: 4, apiId: 135, fdId: 2019, name: 'Serie A',     country: 'İtalya',    flag: '🇮🇹' },
  { id: 5, apiId: 61,  fdId: 2015, name: 'Ligue 1',     country: 'Fransa',    flag: '🇫🇷' },
  { id: 6, apiId: 2,   fdId: 2001, name: 'UCL',         country: 'Avrupa',    flag: '🌍' },
  { id: 7, apiId: 203, fdId: 0,    name: 'Süper Lig',   country: 'Türkiye',   flag: '🇹🇷' },
];

export default function StatsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        <Text style={styles.pageTitle}>İstatistik</Text>
      </View>

      <ScrollView style={styles.scroll}>
        <Text style={styles.sectionLabel}>LİG SEÇ</Text>
        {leagues.map(l => (
          <TouchableOpacity key={l.id} style={styles.leagueItem}
            onPress={() => router.push({
              pathname: '/team_detail',
              params: { leagueName: l.name, leagueFlag: l.flag, fdId: l.fdId, apiId: l.apiId },
            })}>
            <Text style={styles.leagueFlag}>{l.flag}</Text>
            <View style={styles.leagueInfo}>
              <Text style={styles.leagueName}>{l.name}</Text>
              <Text style={styles.leagueCountry}>{l.country}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}
        <View style={{ height: 30 }} />
      </ScrollView>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/')}><Text style={styles.tabText}>Maçlar</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/leagues')}><Text style={styles.tabText}>Ligler</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tab}><Text style={[styles.tabText, styles.tabActive]}>İstatistik</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/profile')}><Text style={styles.tabText}>Profil</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8 },
  appName: { fontSize: 18, fontWeight: '500', color: '#111' },
  appNameBlue: { color: '#185FA5' },
  pageTitle: { fontSize: 13, color: '#888' },
  scroll: { flex: 1 },
  sectionLabel: { fontSize: 11, color: '#888', fontWeight: '500', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, letterSpacing: 0.5 },
  leagueItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#eee', gap: 12 },
  leagueFlag: { fontSize: 28 },
  leagueInfo: { flex: 1 },
  leagueName: { fontSize: 15, fontWeight: '500', color: '#111' },
  leagueCountry: { fontSize: 12, color: '#888', marginTop: 2 },
  arrow: { fontSize: 18, color: '#ccc' },
  tabBar: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#eee', paddingBottom: 20 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 12, color: '#888' },
  tabActive: { color: '#185FA5', fontWeight: '500' },
});

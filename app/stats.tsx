import { useRouter } from 'expo-router';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BottomTabBar from '../components/BottomTabBar';
import { useTheme } from '../context/ThemeContext';

type Stil = 'Hücumcu' | 'Savunmacı' | 'Dengeli';

function computeStil(avgGoals: number): Stil {
  if (avgGoals >= 2.8) return 'Hücumcu';
  if (avgGoals < 2.2)  return 'Savunmacı';
  return 'Dengeli';
}

const leagues = [
  {
    id: 1, apiId: 39, fdId: 2021,
    name: 'Premier Lig', abbrev: 'PL', country: 'İngiltere', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    badgeColor: '#7C3AED', avgGoals: 2.7, tempo: 'Yüksek',
    desc: 'Yüksek tempo, fiziksel oyun ve sıkı rekabet',
  },
  {
    id: 2, apiId: 140, fdId: 2014,
    name: 'La Liga', abbrev: 'LL', country: 'İspanya', flag: '🇪🇸',
    badgeColor: '#EA580C', avgGoals: 2.5, tempo: 'Orta',
    desc: 'Taktik derinlik ve bireysel kalite öne çıkar',
  },
  {
    id: 3, apiId: 78, fdId: 2002,
    name: 'Bundesliga', abbrev: 'BL', country: 'Almanya', flag: '🇩🇪',
    badgeColor: '#DC2626', avgGoals: 3.1, tempo: 'Yüksek',
    desc: "Avrupa'nın en golcü ligi, agresif pressing",
  },
  {
    id: 4, apiId: 135, fdId: 2019,
    name: 'Serie A', abbrev: 'SA', country: 'İtalya', flag: '🇮🇹',
    badgeColor: '#1D4ED8', avgGoals: 2.4, tempo: 'Orta',
    desc: 'Savunma disiplini ve taktiksel sertlik',
  },
  {
    id: 5, apiId: 61, fdId: 2015,
    name: 'Ligue 1', abbrev: 'L1', country: 'Fransa', flag: '🇫🇷',
    badgeColor: '#0891B2', avgGoals: 2.9, tempo: 'Yüksek',
    desc: 'Dinamik oyun, sürpriz sonuçlar sık görülür',
  },
  {
    id: 6, apiId: 2, fdId: 2001,
    name: 'UCL', abbrev: 'CL', country: 'Avrupa', flag: '🌍',
    badgeColor: '#B45309', avgGoals: 2.9, tempo: 'Yüksek',
    desc: "Avrupa'nın elit kulüpleri, eleme formatı",
  },
  {
    id: 7, apiId: 203, fdId: 0,
    name: 'Süper Lig', abbrev: 'SL', country: 'Türkiye', flag: '🇹🇷',
    badgeColor: '#E30A17', avgGoals: 2.6, tempo: 'Yüksek',
    desc: 'Yüksek tempo ve rekabetçi yapı',
  },
  {
    id: 8, apiId: 9999, fdId: 0,
    name: 'Dünya Kupası', abbrev: 'WC', country: 'Dünya', flag: '🌍',
    badgeColor: '#0A3D62', avgGoals: 2.6, tempo: 'Yüksek',
    desc: '48 takım, 2026 ABD-Kanada-Meksika',
  },
];

function stilBadgeColors(stil: Stil, isDark: boolean) {
  if (stil === 'Hücumcu')   return { color: isDark ? '#F85149' : '#A32D2D', bg: isDark ? '#3A1212' : '#FDECEA' };
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Hero */}
        <View style={styles.heroSection}>
          <Text style={[styles.heroTitle, { color: c.text }]}>LİGLER</Text>
          <Text style={[styles.heroSub, { color: c.textMuted }]}>{leagues.length} lig · İstatistik & Turnuvalar</Text>
        </View>

        {/* League Cards */}
        <View style={styles.cardsWrap}>
          {leagues.map(l => {
            const stil = computeStil(l.avgGoals);
            const badge = stilBadgeColors(stil, isDark);
            return (
              <TouchableOpacity
                key={l.id}
                style={[styles.leagueCard, { backgroundColor: c.surface }]}
                activeOpacity={0.7}
                onPress={() => {
                  if (l.apiId === 9999) {
                    router.push({ pathname: '/leagues', params: { openLeague: 'wc' } });
                    return;
                  }
                  router.push({ pathname: '/team_detail', params: { leagueName: l.name, leagueFlag: l.flag, fdId: l.fdId, apiId: l.apiId } });
                }}
              >
                {/* Left: colored abbrev badge */}
                <View style={[styles.abbrevBadge, { backgroundColor: l.badgeColor }]}>
                  <Text style={styles.abbrevText}>{l.abbrev}</Text>
                </View>

                {/* Center: info */}
                <View style={styles.cardBody}>
                  <View style={styles.cardTopRow}>
                    <Text style={[styles.leagueName, { color: l.badgeColor }]} numberOfLines={1}>{l.name}</Text>
                    <View style={[styles.stilPill, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.stilText, { color: badge.color }]}>{stil}</Text>
                    </View>
                  </View>
                  <Text style={[styles.countryText, { color: c.textMuted }]}>{l.flag} {l.country}</Text>
                  <Text style={[styles.descText, { color: c.textFaint }]} numberOfLines={1}>{l.desc}</Text>
                  <View style={[styles.divider, { backgroundColor: c.border }]} />
                  <View style={styles.metricRow}>
                    <View style={styles.metric}>
                      <Text style={[styles.metricVal, { color: c.text }]}>{l.avgGoals.toFixed(1)}</Text>
                      <Text style={[styles.metricLbl, { color: c.textMuted }]}>Gol/Maç</Text>
                    </View>
                    <View style={[styles.metricDivider, { backgroundColor: c.border }]} />
                    <View style={styles.metric}>
                      <Text style={[styles.metricVal, { color: c.text }]}>{l.tempo}</Text>
                      <Text style={[styles.metricLbl, { color: c.textMuted }]}>Tempo</Text>
                    </View>
                    <View style={[styles.metricDivider, { backgroundColor: c.border }]} />
                    <View style={styles.metric}>
                      <Text style={[styles.metricVal, { color: c.text }]}>{stil}</Text>
                      <Text style={[styles.metricLbl, { color: c.textMuted }]}>Profil</Text>
                    </View>
                  </View>
                </View>

                {/* Right: chevron */}
                <Text style={[styles.arrow, { color: c.textVeryFaint }]}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <BottomTabBar activeTab="stats" />
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
  scrollContent: { paddingBottom: 24 },

  heroSection:  { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12 },
  heroTitle:    { fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  heroSub:      { fontSize: 13, marginTop: 3 },

  cardsWrap:    { paddingHorizontal: 12, gap: 10 },
  leagueCard:   {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16,
    padding: 14, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  abbrevBadge:  { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  abbrevText:   { fontSize: 17, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },

  cardBody:     { flex: 1, gap: 2 },
  cardTopRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  leagueName:   { fontSize: 15, fontWeight: '700' },
  stilPill:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  stilText:     { fontSize: 10, fontWeight: '600' },
  countryText:  { fontSize: 11, marginTop: 1 },
  descText:     { fontSize: 11 },
  divider:      { height: 0.5, marginVertical: 7 },

  metricRow:    { flexDirection: 'row', alignItems: 'center' },
  metric:       { flex: 1, alignItems: 'center' },
  metricVal:    { fontSize: 13, fontWeight: '600' },
  metricLbl:    { fontSize: 10, marginTop: 1 },
  metricDivider: { width: 0.5, height: 28 },

  arrow:        { fontSize: 22, flexShrink: 0 },
});

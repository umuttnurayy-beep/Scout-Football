import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BottomTabBar from '../components/BottomTabBar';
import { useTheme } from '../context/ThemeContext';
import { getWorldCupSeasonFixtures } from '../services/api';

// ── Sabitler ──────────────────────────────────────────────────────────────────

const WC_TEAM_TR: Record<string, string> = {
  'Mexico': 'Meksika', 'South Africa': 'Güney Afrika', 'South Korea': 'Güney Kore',
  'Republic of Korea': 'Güney Kore', 'Czech Republic': 'Çekya', 'Czechia': 'Çekya',
  'Canada': 'Kanada', 'Bosnia-Herzegovina': 'Bosna Hersek', 'Bosnia Herzegovina': 'Bosna Hersek',
  'Bosnia and Herzegovina': 'Bosna Hersek',
  'USA': 'ABD', 'United States': 'ABD', 'Paraguay': 'Paraguay',
  'Brazil': 'Brezilya', 'Morocco': 'Fas', 'Qatar': 'Katar', 'Switzerland': 'İsviçre',
  'Haiti': 'Haiti', 'Scotland': 'İskoçya', 'Germany': 'Almanya', 'Curaçao': 'Curaçao',
  'Ivory Coast': 'Fildişi Sahili', "Cote d'Ivoire": 'Fildişi Sahili', "Côte d'Ivoire": 'Fildişi Sahili',
  'Ecuador': 'Ekvador', 'Netherlands': 'Hollanda', 'Japan': 'Japonya',
  'Australia': 'Avustralya', 'Turkey': 'Türkiye', 'Belgium': 'Belçika',
  'Egypt': 'Mısır', 'Saudi Arabia': 'Suudi Arabistan', 'Uruguay': 'Uruguay',
  'Spain': 'İspanya', 'Cape Verde': 'Yeşil Burun Adaları', 'Sweden': 'İsveç',
  'Tunisia': 'Tunus', 'Argentina': 'Arjantin', 'France': 'Fransa',
  'Portugal': 'Portekiz', 'England': 'İngiltere', 'Colombia': 'Kolombiya',
  'Croatia': 'Hırvatistan', 'Serbia': 'Sırbistan', 'Poland': 'Polonya',
  'Nigeria': 'Nijerya', 'Senegal': 'Senegal', 'Iran': 'İran',
  'Venezuela': 'Venezuela', 'Peru': 'Peru', 'Chile': 'Şili',
  'Costa Rica': 'Kosta Rika', 'Honduras': 'Honduras', 'Panama': 'Panama',
  'Jamaica': 'Jamaika', 'Bolivia': 'Bolivya', 'New Zealand': 'Yeni Zelanda',
  'Algeria': 'Cezayir', 'Ghana': 'Gana', 'Cameroon': 'Kamerun',
  'Slovakia': 'Slovakya', 'Romania': 'Romanya', 'Austria': 'Avusturya',
  'Denmark': 'Danimarka', 'Norway': 'Norveç', 'Ukraine': 'Ukrayna',
  'Greece': 'Yunanistan', 'Iraq': 'Irak', 'Indonesia': 'Endonezya',
  'Jordan': 'Ürdün', 'Uzbekistan': 'Özbekistan',
  'Congo DR': 'Demokratik Kongo Cumhuriyeti', 'DR Congo': 'Demokratik Kongo Cumhuriyeti',
  'Democratic Republic of Congo': 'Demokratik Kongo Cumhuriyeti',
  'Democratic Republic of the Congo': 'Demokratik Kongo Cumhuriyeti',
  'Guinea': 'Gine', 'Mali': 'Mali', 'Kenya': 'Kenya',
};

const WC_GROUPS: Record<string, string[]> = {
  A: ['Meksika',   'Güney Afrika',                  'Güney Kore',    'Çekya'],
  B: ['Kanada',    'Bosna Hersek',                  'Katar',         'İsviçre'],
  C: ['Brezilya',  'Fas',                           'Haiti',         'İskoçya'],
  D: ['ABD',       'Paraguay',                      'Avustralya',    'Türkiye'],
  E: ['Almanya',   'Curaçao',                       'Fildişi Sahili','Ekvador'],
  F: ['Hollanda',  'Japonya',                       'İsveç',         'Tunus'],
  G: ['Belçika',   'Mısır',                         'İran',          'Yeni Zelanda'],
  H: ['İspanya',   'Yeşil Burun Adaları',           'Suudi Arabistan','Uruguay'],
  I: ['Fransa',    'Senegal',                       'Irak',          'Norveç'],
  J: ['Arjantin',  'Cezayir',                       'Avusturya',     'Ürdün'],
  K: ['Portekiz',  'Demokratik Kongo Cumhuriyeti',  'Özbekistan',    'Kolombiya'],
  L: ['İngiltere', 'Hırvatistan',                   'Gana',          'Panama'],
};

const WC_GROUP_KEYS = Object.keys(WC_GROUPS);

const WC_MD_PAIRS: [number, number][][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

const WC_TEAM_SHORT: Record<string, string> = {
  'Demokratik Kongo Cumhuriyeti': 'D. Kongo',
  'Yeşil Burun Adaları': 'Yeşil Burun',
  'Güney Afrika': 'G. Afrika',
  'Güney Kore': 'G. Kore',
  'Fildişi Sahili': 'F. Sahili',
  'Bosna Hersek': 'Bosna Her.',
  'Suudi Arabistan': 'S. Arabistan',
  'Yeni Zelanda': 'Y. Zelanda',
};

// Uluslararası tanınmış takım bayrakları (emoji)
const WC_TEAM_FLAG: Record<string, string> = {
  'Meksika': '🇲🇽', 'Güney Afrika': '🇿🇦', 'Güney Kore': '🇰🇷', 'Çekya': '🇨🇿',
  'Kanada': '🇨🇦', 'Bosna Hersek': '🇧🇦', 'Katar': '🇶🇦', 'İsviçre': '🇨🇭',
  'Brezilya': '🇧🇷', 'Fas': '🇲🇦', 'Haiti': '🇭🇹', 'İskoçya': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'ABD': '🇺🇸', 'Paraguay': '🇵🇾', 'Avustralya': '🇦🇺', 'Türkiye': '🇹🇷',
  'Almanya': '🇩🇪', 'Curaçao': '🇨🇼', 'Fildişi Sahili': '🇨🇮', 'Ekvador': '🇪🇨',
  'Hollanda': '🇳🇱', 'Japonya': '🇯🇵', 'İsveç': '🇸🇪', 'Tunus': '🇹🇳',
  'Belçika': '🇧🇪', 'Mısır': '🇪🇬', 'İran': '🇮🇷', 'Yeni Zelanda': '🇳🇿',
  'İspanya': '🇪🇸', 'Yeşil Burun Adaları': '🇨🇻', 'Suudi Arabistan': '🇸🇦', 'Uruguay': '🇺🇾',
  'Fransa': '🇫🇷', 'Senegal': '🇸🇳', 'Irak': '🇮🇶', 'Norveç': '🇳🇴',
  'Arjantin': '🇦🇷', 'Cezayir': '🇩🇿', 'Avusturya': '🇦🇹', 'Ürdün': '🇯🇴',
  'Portekiz': '🇵🇹', 'Demokratik Kongo Cumhuriyeti': '🇨🇩', 'Özbekistan': '🇺🇿', 'Kolombiya': '🇨🇴',
  'İngiltere': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Hırvatistan': '🇭🇷', 'Gana': '🇬🇭', 'Panama': '🇵🇦',
};

function translateWCTeam(name: string): string {
  return WC_TEAM_TR[name] || name;
}

function shortWCTeam(name: string): string {
  return WC_TEAM_SHORT[name] || name;
}

function wcTimeToTurkey(timeStr: string): string {
  if (!timeStr) return '--:--';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h)) return timeStr.slice(0, 5);
  const totalMins = (h * 60 + m + 180) % (24 * 60);
  return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
}

function formatWcDate(dateStr: string): string {
  if (!dateStr) return '';
  const [, mm, dd] = dateStr.split('-');
  const months = ['', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${parseInt(dd, 10)} ${months[parseInt(mm, 10)] || mm}`;
}

type TeamStat = { team: string; played: number; w: number; d: number; l: number; gf: number; ga: number; pts: number };

function computeGroupStandings(group: string, fixtures: any[]): TeamStat[] {
  const teams = WC_GROUPS[group] || [];
  const stats: Record<string, TeamStat> = {};
  teams.forEach(t => { stats[t] = { team: t, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
  for (const f of fixtures) {
    const homeTr = translateWCTeam(f.home || '');
    const awayTr = translateWCTeam(f.away || '');
    if (!teams.includes(homeTr) || !teams.includes(awayTr)) continue;
    if (f.homeScore === null || f.awayScore === null) continue;
    const hs = Number(f.homeScore), as_ = Number(f.awayScore);
    stats[homeTr].gf += hs; stats[homeTr].ga += as_; stats[homeTr].played++;
    stats[awayTr].gf += as_; stats[awayTr].ga += hs; stats[awayTr].played++;
    if (hs > as_) { stats[homeTr].w++; stats[homeTr].pts += 3; stats[awayTr].l++; }
    else if (hs < as_) { stats[awayTr].w++; stats[awayTr].pts += 3; stats[homeTr].l++; }
    else { stats[homeTr].d++; stats[homeTr].pts++; stats[awayTr].d++; stats[awayTr].pts++; }
  }
  return teams.map(t => stats[t]).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    return b.gf - a.gf;
  });
}

// ── Ekran ─────────────────────────────────────────────────────────────────────

export default function WcStatsScreen() {
  const router = useRouter();
  const { colors: c, isDark } = useTheme();
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorldCupSeasonFixtures()
      .then(data => setFixtures(Array.isArray(data) ? data : []))
      .catch(() => setFixtures([]))
      .finally(() => setLoading(false));
  }, []);

  // Tournament-level stats
  const tournamentStats = useMemo(() => {
    const played = fixtures.filter(f => f.homeScore !== null && f.awayScore !== null);
    const totalGoals = played.reduce((s, f) => s + Number(f.homeScore) + Number(f.awayScore), 0);
    const nextMatch = fixtures
      .filter(f => f.homeScore === null)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0] || null;
    return { matchesPlayed: played.length, totalGoals, nextMatch };
  }, [fixtures]);

  // All group standings
  const allGroupStandings = useMemo(() =>
    WC_GROUP_KEYS.reduce<Record<string, TeamStat[]>>((acc, g) => {
      acc[g] = computeGroupStandings(g, fixtures);
      return acc;
    }, {}),
    [fixtures],
  );

  // Upcoming fixtures sorted by date (next 6)
  const upcomingFixtures = useMemo(() =>
    fixtures
      .filter(f => f.homeScore === null && f.date)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 6),
    [fixtures],
  );

  function goToGroup(group: string) {
    router.push({ pathname: '/leagues', params: { openLeague: 'wc', openGroup: group } });
  }

  const WC_BG = isDark ? '#0A1929' : '#E6F1FB';
  const WC_ACCENT = '#185FA5';

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {/* Topbar */}
      <View style={[styles.topbar, { backgroundColor: c.surface }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.primary }]}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: c.textMuted }]}>Dünya Kupası</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Hero Banner */}
        <View style={[styles.heroBanner, { backgroundColor: WC_BG }]}>
          <Text style={styles.heroEmoji}>🏆</Text>
          <View style={styles.heroInfo}>
            <Text style={[styles.heroTitle, { color: WC_ACCENT }]}>FIFA Dünya Kupası 2026</Text>
            <Text style={[styles.heroSub, { color: c.textMuted }]}>48 Takım · 12 Grup · 104 Maç</Text>
            <Text style={[styles.heroSub2, { color: c.textFaint }]}>11 Haz – 19 Tem 2026 · ABD / Kanada / Meksika</Text>
          </View>
        </View>

        {/* Tournament Stats */}
        {tournamentStats.matchesPlayed > 0 && (
          <View style={[styles.statsRow, { backgroundColor: c.surface }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: c.text }]}>{tournamentStats.matchesPlayed}</Text>
              <Text style={[styles.statLbl, { color: c.textMuted }]}>Oynanan Maç</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: c.text }]}>{tournamentStats.totalGoals}</Text>
              <Text style={[styles.statLbl, { color: c.textMuted }]}>Toplam Gol</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: c.text }]}>
                {tournamentStats.matchesPlayed > 0 ? (tournamentStats.totalGoals / tournamentStats.matchesPlayed).toFixed(1) : '—'}
              </Text>
              <Text style={[styles.statLbl, { color: c.textMuted }]}>Gol/Maç</Text>
            </View>
          </View>
        )}

        {/* Upcoming Matches */}
        {upcomingFixtures.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: c.textMuted }]}>YAKLAŞAN MAÇLAR</Text>
            <View style={[styles.upcomingCard, { backgroundColor: c.surface }]}>
              {upcomingFixtures.map((f, i) => {
                const homeTr = translateWCTeam(f.home || '');
                const awayTr = translateWCTeam(f.away || '');
                const groupKey = WC_GROUP_KEYS.find(g => {
                  const teams = WC_GROUPS[g];
                  return teams.includes(homeTr) && teams.includes(awayTr);
                });
                return (
                  <View key={f.id || i} style={[styles.upcomingRow, i < upcomingFixtures.length - 1 && { borderBottomColor: c.border, borderBottomWidth: 0.5 }]}>
                    <View style={styles.upcomingTime}>
                      <Text style={[styles.upcomingDate, { color: c.primary }]}>{formatWcDate(f.date)}</Text>
                      <Text style={[styles.upcomingHour, { color: c.textMuted }]}>{wcTimeToTurkey(f.time)} TR</Text>
                    </View>
                    <Text style={[styles.upcomingTeam, { color: c.text, textAlign: 'right' }]} numberOfLines={1}>
                      {WC_TEAM_FLAG[homeTr] || ''} {shortWCTeam(homeTr)}
                    </Text>
                    <Text style={[styles.upcomingVs, { color: c.textFaint }]}>vs</Text>
                    <Text style={[styles.upcomingTeam, { color: c.text }]} numberOfLines={1}>
                      {shortWCTeam(awayTr)} {WC_TEAM_FLAG[awayTr] || ''}
                    </Text>
                    {groupKey && (
                      <View style={[styles.upcomingGroup, { backgroundColor: WC_BG }]}>
                        <Text style={[styles.upcomingGroupText, { color: WC_ACCENT }]}>{groupKey}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* All Groups */}
        <Text style={[styles.sectionTitle, { color: c.textMuted }]}>TÜM GRUPLAR</Text>
        {loading ? (
          <ActivityIndicator color={c.primary} style={{ marginTop: 32 }} />
        ) : (
          <View style={styles.groupsGrid}>
            {WC_GROUP_KEYS.map(g => {
              const rows = allGroupStandings[g] || [];
              return (
                <TouchableOpacity
                  key={g}
                  style={[styles.groupCard, { backgroundColor: c.surface }]}
                  activeOpacity={0.75}
                  onPress={() => goToGroup(g)}
                >
                  {/* Group header */}
                  <View style={[styles.groupCardHeader, { backgroundColor: WC_BG }]}>
                    <Text style={[styles.groupCardLetter, { color: WC_ACCENT }]}>{g} GRUBU</Text>
                    <Text style={[styles.groupCardArrow, { color: WC_ACCENT }]}>›</Text>
                  </View>
                  {/* Team rows */}
                  {rows.map((row, idx) => {
                    const isEleme = idx < 3;
                    return (
                      <View key={row.team} style={[styles.groupTeamRow, idx < 3 && { borderBottomColor: c.border, borderBottomWidth: 0.5 }]}>
                        <View style={[styles.groupTeamDot, { backgroundColor: isEleme ? WC_ACCENT : 'transparent', borderWidth: isEleme ? 0 : 1, borderColor: c.border }]} />
                        <Text style={[styles.groupTeamFlag]}>{WC_TEAM_FLAG[row.team] || '  '}</Text>
                        <Text style={[styles.groupTeamName, { color: isEleme ? c.text : c.textMuted }]} numberOfLines={1}>
                          {shortWCTeam(row.team)}
                        </Text>
                        <Text style={[styles.groupTeamPts, { color: isEleme ? c.primary : c.textFaint, fontWeight: isEleme ? '700' : '400' }]}>
                          {row.pts}P
                        </Text>
                      </View>
                    );
                  })}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Format Info */}
        <View style={[styles.formatCard, { backgroundColor: c.surface }]}>
          <Text style={[styles.formatTitle, { color: c.text }]}>Turnuva Formatı</Text>
          <View style={styles.formatRow}>
            <Text style={styles.formatEmoji}>🔵</Text>
            <Text style={[styles.formatText, { color: c.textMuted }]}>Her gruptan ilk 2 takım direkt eleme turuna geçer</Text>
          </View>
          <View style={styles.formatRow}>
            <Text style={styles.formatEmoji}>🟡</Text>
            <Text style={[styles.formatText, { color: c.textMuted }]}>12 gruptan en iyi 3. sıradaki 8 takım da elemeye geçer</Text>
          </View>
          <View style={styles.formatRow}>
            <Text style={styles.formatEmoji}>📊</Text>
            <Text style={[styles.formatText, { color: c.textMuted }]}>Toplam 32 takım Round of 32'ye katılır</Text>
          </View>
        </View>

      </ScrollView>

      <BottomTabBar activeTab="stats" />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 52, paddingBottom: 10,
  },
  backBtn:      { paddingVertical: 4, paddingRight: 12 },
  backText:     { fontSize: 16, fontWeight: '500' },
  pageTitle:    { fontSize: 13 },
  scroll:       { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  heroBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 12, marginTop: 12, marginBottom: 6,
    borderRadius: 16, padding: 16,
  },
  heroEmoji:  { fontSize: 40 },
  heroInfo:   { flex: 1, gap: 3 },
  heroTitle:  { fontSize: 16, fontWeight: '800' },
  heroSub:    { fontSize: 12 },
  heroSub2:   { fontSize: 11 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginVertical: 6,
    borderRadius: 14, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statVal:     { fontSize: 18, fontWeight: '700' },
  statLbl:     { fontSize: 11, marginTop: 2 },
  statDivider: { width: 0.5, height: 30 },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginLeft: 16, marginTop: 16, marginBottom: 8 },

  upcomingCard: {
    marginHorizontal: 12, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  upcomingRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 6,
  },
  upcomingTime:  { width: 52, alignItems: 'center' },
  upcomingDate:  { fontSize: 11, fontWeight: '700' },
  upcomingHour:  { fontSize: 10, marginTop: 1 },
  upcomingTeam:  { flex: 1, fontSize: 12, fontWeight: '500' },
  upcomingVs:    { fontSize: 10, minWidth: 16, textAlign: 'center' },
  upcomingGroup: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  upcomingGroupText: { fontSize: 10, fontWeight: '700' },

  groupsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 8, gap: 8,
  },
  groupCard: {
    width: '47.5%', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  groupCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 7,
  },
  groupCardLetter: { fontSize: 12, fontWeight: '800' },
  groupCardArrow:  { fontSize: 16 },
  groupTeamRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 7,
  },
  groupTeamDot:  { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  groupTeamFlag: { fontSize: 13, width: 18 },
  groupTeamName: { flex: 1, fontSize: 11 },
  groupTeamPts:  { fontSize: 11, minWidth: 22, textAlign: 'right' },

  formatCard: {
    marginHorizontal: 12, marginTop: 16, borderRadius: 14, padding: 14, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  formatTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  formatRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  formatEmoji: { fontSize: 14, marginTop: 1 },
  formatText:  { flex: 1, fontSize: 12, lineHeight: 18 },
});

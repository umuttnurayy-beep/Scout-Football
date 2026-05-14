import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SkeletonTeamList } from '../components/SkeletonLoader';
import { useTheme } from '../context/ThemeContext';
import { Standing, getSuperLigStandings, getStandings } from '../services/api';
import { isStanding } from '../services/apiNormalizers';
import { teamDataEmptyMessage } from '../utils/emptyStates';
import { isArrayOf, readTimedCache, writeTimedCache } from '../utils/timedCache';

const TEAM_LIST_STANDINGS_TTL = 60 * 60 * 1000;

function teamListCacheKey(apiId: number) {
  return `team_list_standings_v1_${apiId}`;
}

function teamAbbrev(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words.map(w => w[0] || '').join('').slice(0, 3).toUpperCase();
}

function attackScore(row: Standing, all: Standing[]): number {
  const valid = all.filter(s => s.played > 0);
  if (valid.length === 0) return 5;
  const rates = valid.map(s => s.gf / s.played);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  if (max === min) return 5;
  const rate = row.played > 0 ? row.gf / row.played : 0;
  return 1 + ((rate - min) / (max - min)) * 9;
}

function defenseScore(row: Standing, all: Standing[]): number {
  const valid = all.filter(s => s.played > 0);
  if (valid.length === 0) return 5;
  const rates = valid.map(s => s.ga / s.played);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  if (max === min) return 5;
  const rate = row.played > 0 ? row.ga / row.played : 0;
  return 1 + ((max - rate) / (max - min)) * 9;
}

function scoutRating(row: Standing, all: Standing[]): number {
  return (attackScore(row, all) + defenseScore(row, all)) / 2;
}

const ZONE_COLORS = {
  champions: '#185FA5',
  europa: '#E6A817',
  conference: '#27AE60',
  relegation: '#C0392B',
};

function posZoneColor(pos: number, apiId: number): string | null {
  if (apiId === 2) {
    if (pos <= 8) return ZONE_COLORS.champions;
    if (pos <= 24) return ZONE_COLORS.europa;
    return null;
  }
  if (apiId === 39) {
    if (pos <= 4) return ZONE_COLORS.champions;
    if (pos === 5) return ZONE_COLORS.europa;
    if (pos >= 18) return ZONE_COLORS.relegation;
    return null;
  }
  if (apiId === 78) {
    if (pos <= 4) return ZONE_COLORS.champions;
    if (pos === 5) return ZONE_COLORS.europa;
    if (pos === 6) return ZONE_COLORS.conference;
    if (pos >= 17) return ZONE_COLORS.relegation;
    return null;
  }
  if (apiId === 140 || apiId === 135) {
    if (pos <= 4) return ZONE_COLORS.champions;
    if (pos === 5) return ZONE_COLORS.europa;
    if (pos === 6) return ZONE_COLORS.conference;
    if (pos >= 18) return ZONE_COLORS.relegation;
    return null;
  }
  if (apiId === 61) {
    if (pos <= 3) return ZONE_COLORS.champions;
    if (pos === 5) return ZONE_COLORS.europa;
    if (pos === 6) return ZONE_COLORS.conference;
    if (pos >= 17) return ZONE_COLORS.relegation;
    return null;
  }
  if (apiId === 203) {
    if (pos === 1) return ZONE_COLORS.champions;
    if (pos === 3) return ZONE_COLORS.europa;
    if (pos === 4) return ZONE_COLORS.conference;
    if (pos >= 16) return ZONE_COLORS.relegation;
    return null;
  }
  return null;
}

type SortKey = 'puan' | 'scout' | 'alfa';

export default function TeamDetailScreen() {
  const router = useRouter();
  const { colors: c, isDark } = useTheme();
  const params = useLocalSearchParams();
  const leagueName = Array.isArray(params.leagueName) ? params.leagueName[0] : (params.leagueName || '');
  const leagueFlag = Array.isArray(params.leagueFlag) ? params.leagueFlag[0] : (params.leagueFlag || '');
  const fdId = parseInt(Array.isArray(params.fdId) ? params.fdId[0] : (params.fdId || '0'));
  const apiId = parseInt(Array.isArray(params.apiId) ? params.apiId[0] : (params.apiId || '0'));

  const [teams, setTeams] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('puan');

  useEffect(() => {
    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadTeams(false);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadTeams(showLoader = true) {
    if (showLoader) setLoading(true);
    const cacheKey = teamListCacheKey(apiId);
    const cached = await readTimedCache(cacheKey, TEAM_LIST_STANDINGS_TTL, isArrayOf(isStanding));
    if (cached && cached.length > 0) {
      setTeams(cached);
      if (showLoader) setLoading(false);
    }
    try {
      const data = apiId === 203
        ? await getSuperLigStandings()
        : await getStandings(apiId, { silent: Boolean(cached?.length) });
      if (data && data.length > 0) {
        setTeams(data);
        writeTimedCache(cacheKey, data);
      } else if (!cached?.length) {
        setTeams([]);
      }
    } catch (e) {
      console.error('loadTeams hata:', e);
      if (!cached?.length) setTeams([]);
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  // Stats strip computed values
  const statsStrip = useMemo(() => {
    const valid = teams.filter(t => t.played > 0);
    if (valid.length === 0) return null;
    const totalGf = valid.reduce((s, t) => s + t.gf, 0);
    const totalGa = valid.reduce((s, t) => s + t.ga, 0);
    const totalPlayed = valid.reduce((s, t) => s + t.played, 0);
    const totalWin = valid.reduce((s, t) => s + t.win, 0);
    return {
      count: valid.length,
      avgGf: (totalGf / totalPlayed).toFixed(2),
      avgGa: (totalGa / totalPlayed).toFixed(2),
      winPct: Math.round((totalWin / totalPlayed) * 100),
    };
  }, [teams]);

  const sortedTeams = useMemo(() => {
    let list = teams.filter(t => t.team);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t => t.team.toLowerCase().includes(q));
    }
    switch (sort) {
      case 'scout': return [...list].sort((a, b) => scoutRating(b, teams) - scoutRating(a, teams));
      case 'alfa':  return [...list].sort((a, b) => a.team.localeCompare(b.team, 'tr'));
      default:      return [...list].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga));
    }
  }, [teams, search, sort]);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {/* Topbar */}
      <View style={[styles.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 15, fontWeight: '500' }}>Geri</Text>
        </TouchableOpacity>
        <View style={styles.topbarCenter}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={[styles.topbarTitle, { color: c.text }]} numberOfLines={1}>{leagueFlag} {leagueName}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <SkeletonTeamList />
      ) : teams.length === 0 ? (
        <Text style={[styles.emptyText, { color: c.textMuted }]}>{teamDataEmptyMessage(String(leagueName))}</Text>
      ) : (
        <ScrollView
          style={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}
        >
          {/* Stats Strip */}
          {statsStrip && (
            <View style={[styles.statsStrip, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              {[
                { val: String(statsStrip.count), lbl: 'Takım' },
                { val: statsStrip.avgGf, lbl: 'Ort. Gol' },
                { val: statsStrip.avgGa, lbl: 'Ort. Yenilen' },
                { val: `${statsStrip.winPct}%`, lbl: 'Galibiyet' },
              ].map((item, i) => (
                <View key={i} style={styles.stripItem}>
                  <Text style={[styles.stripVal, { color: c.text }]}>{item.val}</Text>
                  <Text style={[styles.stripLbl, { color: c.textMuted }]}>{item.lbl}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Search */}
          <View style={[styles.searchWrap, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={16} color={c.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              placeholder="Takım ara..."
              placeholderTextColor={c.textFaint}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={c.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Sort Pills */}
          <View style={styles.sortRow}>
            {([
              { key: 'puan',  label: 'Puan' },
              { key: 'scout', label: 'Scout Rating' },
              { key: 'alfa',  label: 'Alfabetik' },
            ] as { key: SortKey; label: string }[]).map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sortPill, {
                  backgroundColor: sort === opt.key ? c.primary : c.surface,
                  borderColor: sort === opt.key ? c.primary : c.border,
                }]}
                onPress={() => setSort(opt.key)}
              >
                <Text style={[styles.sortPillText, { color: sort === opt.key ? '#fff' : c.textMuted }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Team Rows */}
          {sortedTeams.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.textMuted, paddingHorizontal: 16, paddingTop: 24 }]}>
              Eşleşen takım bulunamadı
            </Text>
          ) : sortedTeams.map((team, i) => {
            const abbrev = teamAbbrev(team.team);
            const sr = scoutRating(team, teams);
            const zoneColor = posZoneColor(team.pos, apiId);
            const avgGf = team.played > 0 ? (team.gf / team.played).toFixed(2) : '—';
            return (
              <TouchableOpacity
                key={i}
                style={[styles.teamRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}
                activeOpacity={0.7}
                onPress={() => router.push({
                  pathname: '/team_stats',
                  params: {
                    teamName: team.team,
                    teamId: team.teamId || 0,
                    leagueName,
                    leagueFlag,
                    fdId,
                    apiId,
                    pos: team.pos,
                    played: team.played,
                    win: team.win,
                    draw: team.draw,
                    loss: team.loss,
                    gf: team.gf,
                    ga: team.ga,
                    pts: team.pts,
                    scoutRating: sr.toFixed(1),
                  },
                })}
              >
                {/* Zone color bar */}
                <View style={[styles.zoneBar, { backgroundColor: zoneColor ?? 'transparent' }]} />

                {/* Pos badge */}
                <View style={[styles.posBadge, zoneColor ? { backgroundColor: zoneColor } : { backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.posText, { color: zoneColor ? '#fff' : c.textMuted }]}>{team.pos}</Text>
                </View>

                {/* Abbrev box */}
                <View style={[styles.abbrevBox, { backgroundColor: c.primaryLight }]}>
                  <Text style={[styles.abbrevText, { color: c.primaryDark }]}>{abbrev}</Text>
                </View>

                {/* Name + avg gf */}
                <View style={styles.nameCol}>
                  <Text style={[styles.teamName, { color: c.text }]} numberOfLines={1}>{team.team}</Text>
                  <Text style={[styles.teamSub, { color: c.textFaint }]}>Gol/Maç {avgGf}</Text>
                </View>

                {/* Pts + Scout Rating */}
                <View style={styles.rightCol}>
                  <Text style={[styles.ptsVal, { color: c.text }]}>{team.pts}</Text>
                  <Text style={[styles.ptsLbl, { color: c.textMuted }]}>Puan</Text>
                  <View style={[styles.srBadge, { backgroundColor: isDark ? '#1A2744' : '#E6F1FB' }]}>
                    <Text style={[styles.srVal, { color: c.primary }]}>{sr.toFixed(1)}</Text>
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={16} color={c.textVeryFaint} />
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  topbar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 10, borderBottomWidth: 0.5 },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 2 },
  topbarCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerLogo:   { width: 28, height: 28, resizeMode: 'contain' },
  topbarTitle:  { fontSize: 14, fontWeight: '500' },
  scroll:       { flex: 1 },
  emptyText:    { textAlign: 'center', marginTop: 40, fontSize: 13 },

  // Stats strip
  statsStrip:   { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 0.5 },
  stripItem:    { flex: 1, alignItems: 'center' },
  stripVal:     { fontSize: 16, fontWeight: '700' },
  stripLbl:     { fontSize: 10, marginTop: 2 },

  // Search
  searchWrap:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 12, marginBottom: 4, borderRadius: 10, borderWidth: 0.5, paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  searchInput:  { flex: 1, fontSize: 14, padding: 0 },

  // Sort pills
  sortRow:      { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  sortPill:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5 },
  sortPillText: { fontSize: 12, fontWeight: '500' },

  // Team row
  teamRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, gap: 8 },
  zoneBar:      { width: 3, height: 36, borderRadius: 1.5 },
  posBadge:     { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  posText:      { fontSize: 11, fontWeight: '700' },
  abbrevBox:    { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  abbrevText:   { fontSize: 12, fontWeight: '700' },
  nameCol:      { flex: 1 },
  teamName:     { fontSize: 13, fontWeight: '500' },
  teamSub:      { fontSize: 11, marginTop: 2 },
  rightCol:     { alignItems: 'center', gap: 3 },
  ptsVal:       { fontSize: 15, fontWeight: '700' },
  ptsLbl:       { fontSize: 9 },
  srBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  srVal:        { fontSize: 11, fontWeight: '700' },
});

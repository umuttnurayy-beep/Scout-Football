import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Standing, getSuperLigStandings, getStandings } from '../services/api';
import { isStanding } from '../services/apiNormalizers';
import { teamDataEmptyMessage } from '../utils/emptyStates';
import { isArrayOf, readTimedCache, writeTimedCache } from '../utils/timedCache';

const TEAM_LIST_STANDINGS_TTL = 60 * 60 * 1000;

function teamListCacheKey(apiId: number) {
  return `team_list_standings_v1_${apiId}`;
}

export default function TeamDetailScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const params = useLocalSearchParams();
  const leagueName = Array.isArray(params.leagueName) ? params.leagueName[0] : (params.leagueName || '');
  const leagueFlag = Array.isArray(params.leagueFlag) ? params.leagueFlag[0] : (params.leagueFlag || '');
  const fdId = parseInt(Array.isArray(params.fdId) ? params.fdId[0] : (params.fdId || '0'));
  const apiId = parseInt(Array.isArray(params.apiId) ? params.apiId[0] : (params.apiId || '0'));

  const [teams, setTeams] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTeams();
    // League route params are fixed for this screen instance.
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

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
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

      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>{'TAKIMLAR — A\'DAN Z\'YE'}</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
      ) : teams.length === 0 ? (
        <Text style={[styles.emptyText, { color: c.textMuted }]}>{teamDataEmptyMessage(String(leagueName))}</Text>
      ) : (
        <ScrollView
          style={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}
        >
          {[...teams]
            .filter(t => t.team)
            .sort((a, b) => a.team.localeCompare(b.team, 'tr'))
            .map((team, i) => {
              const initials = team.team.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <TouchableOpacity key={i} style={[styles.teamItem, { backgroundColor: c.surface, borderBottomColor: c.border }]}
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
                    },
                  })}>
                  <View style={[styles.teamInitial, { backgroundColor: c.primaryLight }]}>
                    <Text style={[styles.teamInitialText, { color: c.primary }]}>{initials}</Text>
                  </View>
                  <Text style={[styles.teamName, { color: c.text }]}>{team.team}</Text>
                  <Text style={[styles.teamPts, { color: c.textMuted }]}>{team.pts} P</Text>
                  <Text style={[styles.arrow, { color: c.textVeryFaint }]}>›</Text>
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
  container:        { flex: 1 },
  topbar:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 10, borderBottomWidth: 0.5 },
  backBtn:          { flexDirection: 'row', alignItems: 'center', gap: 2 },
  topbarCenter:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerLogo:       { width: 28, height: 28, resizeMode: 'contain' },
  topbarTitle:      { fontSize: 14, fontWeight: '500' },
  sectionLabel:     { fontSize: 11, fontWeight: '500', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, letterSpacing: 0.5 },
  scroll:           { flex: 1 },
  emptyText:        { textAlign: 'center', marginTop: 40, fontSize: 13 },
  teamItem:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, gap: 10 },
  teamInitial:      { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  teamInitialText:  { fontSize: 13, fontWeight: '500' },
  teamName:         { flex: 1, fontSize: 14 },
  teamPts:          { fontSize: 12 },
  arrow:            { fontSize: 18 },
});

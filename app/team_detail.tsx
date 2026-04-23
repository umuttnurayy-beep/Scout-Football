import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getSuperLigStandings, getStandings } from '../services/api';

type Team = {
  id?: number;
  pos: number;
  team: string;
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  pts: number;
};

export default function TeamDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const leagueName = Array.isArray(params.leagueName) ? params.leagueName[0] : (params.leagueName || '');
  const leagueFlag = Array.isArray(params.leagueFlag) ? params.leagueFlag[0] : (params.leagueFlag || '');
  const fdId = parseInt(Array.isArray(params.fdId) ? params.fdId[0] : (params.fdId || '0'));
  const apiId = parseInt(Array.isArray(params.apiId) ? params.apiId[0] : (params.apiId || '0'));

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTeams(); }, []);

  async function loadTeams() {
    setLoading(true);
    try {
      const data = apiId === 203
        ? await getSuperLigStandings()
        : await getStandings(apiId);
      setTeams(data || []);
    } catch (e) {
      console.log('loadTeams hata:', e);
      setTeams([]);
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>{leagueFlag} {leagueName}</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.sectionLabel}>TAKIMLAR — A'DAN Z'YE</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#185FA5" />
      ) : teams.length === 0 ? (
        <Text style={styles.emptyText}>Takım verisi bulunamadı.</Text>
      ) : (
        <ScrollView style={styles.scroll}>
          {[...teams]
            .filter(t => t.team)
            .sort((a, b) => a.team.localeCompare(b.team, 'tr'))
            .map((team, i) => {
              const initials = team.team.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <TouchableOpacity key={i} style={styles.teamItem}
                  onPress={() => router.push({
                    pathname: '/team_stats',
                    params: {
                      teamName: team.team,
teamId: (team as any).teamId || team.id || 0,                      leagueName,
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
                  <View style={styles.teamInitial}>
                    <Text style={styles.teamInitialText}>{initials}</Text>
                  </View>
                  <Text style={styles.teamName}>{team.team}</Text>
                  <Text style={styles.teamPts}>{team.pts} P</Text>
                  <Text style={styles.arrow}>›</Text>
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
  container: { flex: 1, backgroundColor: '#fff' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  backBtn: { fontSize: 16, color: '#185FA5', fontWeight: '500' },
  topbarTitle: { fontSize: 14, fontWeight: '500', color: '#111' },
  sectionLabel: { fontSize: 11, color: '#888', fontWeight: '500', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, letterSpacing: 0.5 },
  scroll: { flex: 1 },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 13 },
  teamItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#eee', gap: 10 },
  teamInitial: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#E6F1FB', alignItems: 'center', justifyContent: 'center' },
  teamInitialText: { fontSize: 13, fontWeight: '500', color: '#0C447C' },
  teamName: { flex: 1, fontSize: 14, color: '#111' },
  teamPts: { fontSize: 12, color: '#888' },
  arrow: { fontSize: 18, color: '#ccc' },
});

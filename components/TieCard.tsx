import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { UCLTie, tieResult } from '../utils/leagueAnalysis';

export default function TieCard({ tie, isFinal }: { tie: UCLTie; isFinal?: boolean }) {
  const { colors: c } = useTheme();
  const { homeAgg, awayAgg, winner } = tieResult(tie);
  const l1 = tie.leg1, l2 = tie.leg2;
  const homeName = l1.homeTeam?.shortName || l1.homeTeam?.name || '?';
  const awayName = l1.awayTeam?.shortName || l1.awayTeam?.name || '?';
  const l1h = l1.score?.fullTime?.home, l1a = l1.score?.fullTime?.away;
  const l2h = l2?.score?.fullTime?.home, l2a = l2?.score?.fullTime?.away;
  const hasScore = l1h != null && l1a != null;
  const secondLegPlayed = !l2 || (l2h != null && l2a != null);
  const fmt = (d: string) => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const homeWins = !!winner && winner === homeName;
  const awayWins = !!winner && winner === awayName;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.teamsRow}>
        <Text style={[styles.teamName, { color: c.text }, homeWins && { color: c.primary, fontWeight: '700' }]} numberOfLines={1}>
          {homeName}
        </Text>
        <View style={styles.scoreBlock}>
          {hasScore ? (
            <>
              <Text style={[styles.aggScore, { color: c.text }]}>{homeAgg} – {awayAgg}</Text>
              <Text style={[styles.aggLabel, { color: c.textFaint }]}>{l2 ? 'TOPLAM' : 'SONUÇ'}</Text>
            </>
          ) : (
            <Text style={[styles.tbd, { color: c.textVeryFaint }]}>— : —</Text>
          )}
        </View>
        <Text style={[styles.teamName, { color: c.text, textAlign: 'right' }, awayWins && { color: c.primary, fontWeight: '700' }]} numberOfLines={1}>
          {awayName}
        </Text>
      </View>

      {hasScore && l2 && (
        <View style={styles.legsRow}>
          <Text style={[styles.legText, { color: c.textMuted }]}>1. Maç ({fmt(l1.utcDate)}): {l1h}–{l1a}</Text>
          <Text style={[styles.legSep, { color: c.textVeryFaint }]}>·</Text>
          <Text style={[styles.legText, { color: c.textMuted }]}>
            2. Maç ({fmt(l2.utcDate)}): {l2h != null && l2a != null ? `${l2h}–${l2a}` : 'oynanmadı'}
          </Text>
        </View>
      )}
      {hasScore && !l2 && (
        <Text style={[styles.legText, { color: c.textMuted, marginTop: 2 }]}>{fmt(l1.utcDate)}</Text>
      )}

      {winner ? (
        <View style={[styles.winnerBadge, { backgroundColor: c.primaryLight }]}>
          <Text style={[styles.winnerText, { color: c.primary }]}>
            {isFinal ? '🏆' : '✅'} {winner}
          </Text>
        </View>
      ) : hasScore && secondLegPlayed ? (
        <View style={[styles.winnerBadge, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[styles.winnerText, { color: c.textMuted }]}>⏳ Uzatma / Penaltı</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card:        { marginHorizontal: 14, marginBottom: 10, borderRadius: 10, borderWidth: 0.5, padding: 14 },
  teamsRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  teamName:    { flex: 1, fontSize: 13, fontWeight: '500' },
  scoreBlock:  { alignItems: 'center', paddingHorizontal: 10, minWidth: 90 },
  aggScore:    { fontSize: 20, fontWeight: '700' },
  aggLabel:    { fontSize: 9, letterSpacing: 0.5, marginTop: 1 },
  tbd:         { fontSize: 16, fontWeight: '500' },
  legsRow:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  legText:     { fontSize: 11 },
  legSep:      { fontSize: 11 },
  winnerBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginTop: 6 },
  winnerText:  { fontSize: 12, fontWeight: '600' },
});

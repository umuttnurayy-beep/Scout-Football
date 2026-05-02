import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { FDMatch } from '../services/api';

export default function FormHeatRow({ matches, teamId, label }: { matches: FDMatch[]; teamId: number; label: string }) {
  const { colors: fc } = useTheme();
  const last5=[...matches]
    .filter(m=>m.score?.fullTime?.home!=null)
    .sort((a,b)=>new Date(a.utcDate??0).getTime()-new Date(b.utcDate??0).getTime())
    .slice(-5);
  if (last5.length===0) return null;
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: fc.textSub }]} numberOfLines={1}>{label}</Text>
      <View style={styles.badges}>
        {last5.map((m,i)=>{
          const isHome=m.homeTeam?.id===teamId;
          const gf=isHome?m.score.fullTime.home:m.score.fullTime.away;
          const ga=isHome?m.score.fullTime.away:m.score.fullTime.home;
          const result=gf!=null&&ga!=null?(gf>ga?'G':gf===ga?'B':'M'):'M';
          const bg=result==='G'?fc.win:result==='B'?fc.draw:fc.loss;
          return (
            <View key={i} style={[styles.badge, { backgroundColor: bg }]}>
              <Text style={styles.badgeText}>{result}</Text>
              <Text style={styles.badgeSub}>{isHome?'İ':'D'}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, gap: 10 },
  label:     { width: 90, fontSize: 11, fontWeight: '500' },
  badges:    { flexDirection: 'row', gap: 5 },
  badge:     { width: 32, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  badgeSub:  { fontSize: 8, color: 'rgba(255,255,255,0.75)' },
});

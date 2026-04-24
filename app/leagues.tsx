import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getStandings, getSuperLigStandings, getUclKnockouts } from '../services/api';

const leagues = [
  { id: 1, apiId: 39,  name: 'Premier Lig', country: 'İngiltere', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', season: '2025/26' },
  { id: 2, apiId: 140, name: 'La Liga',     country: 'İspanya',   flag: '🇪🇸', season: '2025/26' },
  { id: 3, apiId: 78,  name: 'Bundesliga',  country: 'Almanya',   flag: '🇩🇪', season: '2025/26' },
  { id: 4, apiId: 135, name: 'Serie A',     country: 'İtalya',    flag: '🇮🇹', season: '2025/26' },
  { id: 5, apiId: 61,  name: 'Ligue 1',     country: 'Fransa',    flag: '🇫🇷', season: '2025/26' },
  { id: 6, apiId: 2,   name: 'UCL',         country: 'Avrupa',    flag: '🌍', season: '2025/26' },
  { id: 7, apiId: 203, name: 'Süper Lig',   country: 'Türkiye',   flag: '🇹🇷', season: '2025/26' },
];

const UCL_STAGES = [
  { key: 'KNOCKOUT_ROUND_PLAY_OFF', label: 'Play-off'     },
  { key: 'ROUND_OF_16',             label: 'Son 16'       },
  { key: 'QUARTER_FINALS',          label: 'Çeyrek Final' },
  { key: 'SEMI_FINALS',             label: 'Yarı Final'   },
  { key: 'FINAL',                   label: 'Final'        },
];

const SUB_TABS = [
  { key: 'genel',    label: 'Genel'        },
  { key: 'tablo',    label: 'Puan Tablosu' },
  { key: 'takimlar', label: 'Takımlar'     },
  { key: 'trendler', label: 'Trendler'     },
] as const;
type SubTab = typeof SUB_TABS[number]['key'];

type Level    = 'Düşük' | 'Orta' | 'Yüksek';
type League   = typeof leagues[0];
type Standing = { pos: number; team: string; played: number; win: number; draw: number; loss: number; gf: number; ga: number; pts: number; };
type LeagueChar = {
  label: string; color: string; bg: string; traits: string[]; rec: string; ozet: string;
  gol: Level; tempo: Level; risk: Level; stil: string;
};

// ── UCL TIE HELPERS ───────────────────────────────────────────

function groupTies(matches: any[]): any[] {
  const ties: any[] = [];
  const used = new Set<number>();
  for (let i = 0; i < matches.length; i++) {
    if (used.has(i)) continue;
    const m = matches[i];
    const hId = m.homeTeam?.id, aId = m.awayTeam?.id;
    const ret = matches.findIndex((n, j) =>
      !used.has(j) && j !== i && n.homeTeam?.id === aId && n.awayTeam?.id === hId
    );
    if (ret === -1) {
      ties.push({ leg1: m, leg2: null });
    } else {
      used.add(ret);
      const [first, second] = new Date(m.utcDate) <= new Date(matches[ret].utcDate)
        ? [m, matches[ret]] : [matches[ret], m];
      ties.push({ leg1: first, leg2: second });
    }
    used.add(i);
  }
  return ties;
}

function tieResult(tie: any): { homeAgg: number; awayAgg: number; winner: string | null } {
  const l1 = tie.leg1, l2 = tie.leg2;
  if (!l2) {
    const fh = l1.score?.fullTime?.home, fa = l1.score?.fullTime?.away;
    if (fh == null) return { homeAgg: 0, awayAgg: 0, winner: null };
    const winner = fh > fa ? (l1.homeTeam?.shortName || l1.homeTeam?.name)
                 : fa > fh ? (l1.awayTeam?.shortName || l1.awayTeam?.name) : null;
    return { homeAgg: fh, awayAgg: fa, winner };
  }
  const l1h = l1.score?.fullTime?.home ?? null, l1a = l1.score?.fullTime?.away ?? null;
  const l2h = l2.score?.fullTime?.home ?? null, l2a = l2.score?.fullTime?.away ?? null;
  if (l1h == null || l2h == null) return { homeAgg: 0, awayAgg: 0, winner: null };
  const homeAgg = l1h + l2a, awayAgg = l1a + l2h;
  const winner = homeAgg > awayAgg ? (l1.homeTeam?.shortName || l1.homeTeam?.name)
               : awayAgg > homeAgg ? (l1.awayTeam?.shortName || l1.awayTeam?.name) : null;
  return { homeAgg, awayAgg, winner };
}

function TieCard({ tie, isFinal }: { tie: any; isFinal?: boolean }) {
  const { homeAgg, awayAgg, winner } = tieResult(tie);
  const l1 = tie.leg1, l2 = tie.leg2;
  const homeName = l1.homeTeam?.shortName || l1.homeTeam?.name || '?';
  const awayName = l1.awayTeam?.shortName || l1.awayTeam?.name || '?';
  const l1h = l1.score?.fullTime?.home, l1a = l1.score?.fullTime?.away;
  const l2h = l2?.score?.fullTime?.home, l2a = l2?.score?.fullTime?.away;
  const hasScore = l1h != null;
  const fmt = (d: string) => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const homeWins = !!winner && winner === homeName;
  const awayWins = !!winner && winner === awayName;

  return (
    <View style={bkStyles.card}>
      <View style={bkStyles.teamsRow}>
        <Text style={[bkStyles.teamName, homeWins && { color: '#185FA5', fontWeight: '700' }]} numberOfLines={1}>
          {homeName}
        </Text>
        <View style={bkStyles.scoreBlock}>
          {hasScore ? (
            <>
              <Text style={bkStyles.aggScore}>{homeAgg} – {awayAgg}</Text>
              <Text style={bkStyles.aggLabel}>{l2 ? 'TOPLAM' : 'SONUÇ'}</Text>
            </>
          ) : (
            <Text style={bkStyles.tbd}>— : —</Text>
          )}
        </View>
        <Text style={[bkStyles.teamName, { textAlign: 'right' }, awayWins && { color: '#A32D2D', fontWeight: '700' }]} numberOfLines={1}>
          {awayName}
        </Text>
      </View>

      {hasScore && l2 && (
        <View style={bkStyles.legsRow}>
          <Text style={bkStyles.legText}>1. Maç ({fmt(l1.utcDate)}): {l1h}–{l1a}</Text>
          <Text style={bkStyles.legSep}>·</Text>
          <Text style={bkStyles.legText}>2. Maç ({fmt(l2.utcDate)}): {l2h ?? '?'}–{l2a ?? '?'}</Text>
        </View>
      )}
      {hasScore && !l2 && (
        <Text style={[bkStyles.legText, { marginTop: 2 }]}>{fmt(l1.utcDate)}</Text>
      )}

      {winner ? (
        <View style={[bkStyles.winnerBadge, { backgroundColor: homeWins ? '#E6F1FB' : '#FDE8E8' }]}>
          <Text style={[bkStyles.winnerText, { color: homeWins ? '#185FA5' : '#A32D2D' }]}>
            {isFinal ? '🏆' : '✅'} {winner}
          </Text>
        </View>
      ) : hasScore ? (
        <View style={[bkStyles.winnerBadge, { backgroundColor: '#f0f0f0' }]}>
          <Text style={[bkStyles.winnerText, { color: '#888' }]}>⏳ Uzatma / Penaltı</Text>
        </View>
      ) : null}
    </View>
  );
}

const bkStyles = StyleSheet.create({
  card:        { marginHorizontal: 14, marginBottom: 10, borderRadius: 10, borderWidth: 0.5, borderColor: '#e0e0e0', padding: 14, backgroundColor: '#fafafa' },
  teamsRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  teamName:    { flex: 1, fontSize: 13, color: '#111', fontWeight: '500' },
  scoreBlock:  { alignItems: 'center', paddingHorizontal: 10, minWidth: 90 },
  aggScore:    { fontSize: 20, fontWeight: '700', color: '#111' },
  aggLabel:    { fontSize: 9, color: '#aaa', letterSpacing: 0.5, marginTop: 1 },
  tbd:         { fontSize: 16, color: '#bbb', fontWeight: '500' },
  legsRow:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  legText:     { fontSize: 11, color: '#888' },
  legSep:      { fontSize: 11, color: '#ccc' },
  winnerBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginTop: 6 },
  winnerText:  { fontSize: 12, fontWeight: '600' },
});

// ── ANALYSIS HELPERS ──────────────────────────────────────────

function getTagColor(level: Level): { color: string; bg: string } {
  if (level === 'Yüksek') return { color: '#A32D2D', bg: '#FDE8E8' };
  if (level === 'Orta')   return { color: '#E6A817', bg: '#FFF8E1' };
  return                         { color: '#666',    bg: '#f0f0f0' };
}

function getLeagueCharacter(avgGoals: number, drawRate: number): LeagueChar {
  const gol: Level   = avgGoals >= 2.8 ? 'Yüksek' : avgGoals >= 2.2 ? 'Orta' : 'Düşük';
  const tempo: Level = avgGoals >= 2.7 ? 'Yüksek' : avgGoals >= 2.2 ? 'Orta' : 'Düşük';
  const risk: Level  = drawRate >= 0.30 ? 'Yüksek' : drawRate >= 0.25 ? 'Orta' : 'Düşük';
  const stil         = gol === 'Yüksek' ? 'Hücumcu' : gol === 'Düşük' ? 'Savunmacı' : 'Dengeli';

  let label: string, color: string, bg: string, traits: string[], rec: string, ozet: string;

  if (avgGoals >= 3.0) {
    label = 'Hücum Ağırlıklı'; color = '#A32D2D'; bg = '#FDE8E8';
    traits = ['Yüksek gol ortalaması', 'Over 2.5 eğilimi güçlü', 'Savunma açıkları belirgin'];
    rec  = 'Over 2.5, KG Var kombinasyonları öne çıkar';
    ozet = 'Yüksek tempolu ve gollü bir lig. Savunmalar açık, her iki kale tehlikede — favoriler baskı kuruyor.';
  } else if (avgGoals < 2.0 && drawRate >= 0.28) {
    label = 'Savunma & Sıkışık'; color = '#27500A'; bg = '#E8F5E9';
    traits = ['Az gol, beraberlik eğilimi yüksek', 'Alt 2.5 çok sık', 'Favori avantajı sınırlı'];
    rec  = 'Alt 2.5, çift şans (1X/X2) bahisleri değerli';
    ozet = 'Sıkı savunma anlayışı ve yüksek beraberlik oranıyla öne çıkan bir lig. Sürpriz sonuçlar sık yaşanıyor.';
  } else if (avgGoals < 2.0) {
    label = 'Savunma Ağırlıklı'; color = '#27500A'; bg = '#E8F5E9';
    traits = ['Düşük gol ortalaması', 'Sıkı savunma anlayışı', 'Net sonuçlar ağırlıkta'];
    rec  = "Alt 2.5, maç galibi — over'dan kaçın";
    ozet = 'Savunma disiplini ön planda; gol sayısı düşük. Maçlar sıkışık seyrediyor, net galibiyetler belirleyici.';
  } else if (drawRate >= 0.30) {
    label = 'Beraberlik Eğilimli'; color = '#5b2d8e'; bg = '#F3E5F5';
    traits = ['Yüksek beraberlik oranı', 'Sonuç belirsizliği fazla', 'Güçlü savunma dengeleri'];
    rec  = 'Beraberlik, çift şans — net galibiyet riski var';
    ozet = 'Beraberlikler sık, sonuçlar belirsiz. Dengeli güç dağılımı sürprizlere zemin hazırlıyor.';
  } else if (avgGoals >= 2.5 && drawRate <= 0.24) {
    label = 'Hücumcu & Sonuç Odaklı'; color = '#E6A817'; bg = '#FFF8E1';
    traits = ['Gollü ve net galibiyetli', 'Takımlar arası fark belirgin', 'Over + galibiyet birlikte güçlü'];
    rec  = 'Over 2.5 + maç galibi kombinasyonu etkili';
    ozet = 'Gollü ve sonuç odaklı bir lig. Favoriler genelde kazanıyor; güçlü takımlar farkı büyütüyor.';
  } else {
    label = 'Dengeli'; color = '#185FA5'; bg = '#E6F1FB';
    traits = ['Dengeli hücum-savunma', 'Çeşitli sonuç profilleri', 'Maç özelinde analiz gerekli'];
    rec  = 'Maç bazında değerlendirme yapılmalı';
    ozet = 'Dengeli yapıda bir lig. Hücum ve savunma birbirine yakın; maç özelinde derin analiz şart.';
  }

  return { label, color, bg, traits, rec, ozet, gol, tempo, risk, stil };
}

function getLiderTags(
  leader: Standing,
  sortedByGfR: Standing[],
  sortedByGaR: Standing[],
  leaderGap: number,
): { label: string; color: string; bg: string }[] {
  const tags: { label: string; color: string; bg: string }[] = [];
  const winRate     = leader.played > 0 ? leader.win / leader.played : 0;
  const isTopScorer = sortedByGfR[0]?.team === leader.team;
  const isBestDef   = sortedByGaR[0]?.team === leader.team;

  if (isTopScorer)      tags.push({ label: '⚽ En Golcü',        color: '#A32D2D', bg: '#FDE8E8' });
  if (isBestDef)        tags.push({ label: '🛡️ Sağlam Savunma', color: '#27500A', bg: '#E8F5E9' });
  if (winRate >= 0.65)  tags.push({ label: '🔥 Dominant',        color: '#E6A817', bg: '#FFF8E1' });
  if (leaderGap >= 8)   tags.push({ label: '📏 Açık Ara Lider',  color: '#5b2d8e', bg: '#F3E5F5' });
  if (leader.loss === 0) tags.push({ label: '✅ Yenilmez',       color: '#185FA5', bg: '#E6F1FB' });
  if (tags.length === 0) tags.push({ label: '🏆 Lider',          color: '#185FA5', bg: '#E6F1FB' });

  return tags;
}

function getTeamPersonality(lblLabel: string, avgGf: number, avgGa: number, winRate: number): string {
  const winPct = Math.round(winRate * 100);
  if (lblLabel === 'Formda')             return `${winPct}% galibiyet oranı — bu sezonun en tutarlı takımlarından.`;
  if (lblLabel === 'Hücumcu & Kırılgan') return `${avgGf.toFixed(1)} gol atıp ${avgGa.toFixed(1)} gol yiyor — tahmin etmesi güç profil.`;
  if (lblLabel === 'Hücumcu')            return `${avgGf.toFixed(1)} gol/maç ile lig ortalamasının üzerinde üretim yapıyor.`;
  if (lblLabel === 'Savunmacı')          return `Maç başı yalnızca ${avgGa.toFixed(1)} gol yiyen sıkı savunma profili.`;
  if (lblLabel === 'Dengesiz')           return `${winPct}% galibiyet — istikrarsız yapı, sürprizlere açık.`;
  return 'Dengeli skor profili; büyük sürpriz ya da hayal kırıklığı beklentisi düşük.';
}

function getLeaderNarrative(leader: Standing, second: Standing | undefined): string {
  const winRate = leader.played > 0 ? leader.win / leader.played : 0;
  const gfPer   = leader.played > 0 ? leader.gf / leader.played : 0;
  const gaPer   = leader.played > 0 ? leader.ga / leader.played : 0;
  const gap     = second ? leader.pts - second.pts : 0;
  if (leader.loss === 0)  return `${leader.played} maçta yenilmedi — sezonun en istikrarlı takımı.`;
  if (winRate >= 0.70)    return `Her 10 maçtan ${Math.round(winRate * 10)}'ini kazanıyor — ligin tartışmasız lideri.`;
  if (gfPer >= 2.5)       return `Maç başı ${gfPer.toFixed(1)} golle ligin golcü motoru.`;
  if (gaPer < 0.9)        return `Savunma gücüyle öne çıkıyor — maç başı yalnızca ${gaPer.toFixed(1)} gol yiyor.`;
  if (gap >= 8)           return `İkinciden ${gap} puan önde — şampiyonluğa en yakın aday.`;
  return `${gap} puanlık avantajla önde, tablo henüz netleşmedi.`;
}

function getTeamLabel(gfPer: number, gaPer: number, winRate: number, pos: number, total: number, avgGfPer: number, avgGaPer: number) {
  if (winRate >= 0.60)                                       return { label: 'Formda',              color: '#185FA5', bg: '#E6F1FB' };
  if (gfPer >= avgGfPer * 1.25 && gaPer >= avgGaPer * 1.15) return { label: 'Hücumcu & Kırılgan',  color: '#E6A817', bg: '#FFF8E1' };
  if (gfPer >= avgGfPer * 1.20)                             return { label: 'Hücumcu',             color: '#A32D2D', bg: '#FDE8E8' };
  if (gaPer <= avgGaPer * 0.80)                             return { label: 'Savunmacı',           color: '#27500A', bg: '#E8F5E9' };
  if (winRate < 0.25 && pos > total * 0.60)                 return { label: 'Dengesiz',            color: '#C0392B', bg: '#FDECEA' };
  return                                                            { label: 'Dengeli',             color: '#888',    bg: '#f5f5f5' };
}

function getBadgeStyle(pos: number, total: number, apiId: number) {
  if (apiId === 2) return pos <= 8 ? styles.posTop : pos <= 24 ? styles.posMid : styles.posNormal;
  if (apiId === 203) {
    if (pos === 1) return styles.posTop;
    if (pos <= 3) return styles.posMid;
    if (pos <= 6) return styles.posConf;
    if (pos > total - 3) return styles.posRel;
    return styles.posNormal;
  }
  if (pos <= 4) return styles.posTop;
  if (pos === 5) return styles.posMid;
  if (pos === 6) return styles.posConf;
  return styles.posNormal;
}

// ── SCREEN ────────────────────────────────────────────────────

export default function LeaguesScreen() {
  const router = useRouter();
  const [activeLeague, setActiveLeague] = useState<League>(leagues[0]);
  const [subTab, setSubTab]             = useState<SubTab>('genel');
  const [uclView, setUclView]           = useState<'standings' | 'bracket'>('standings');
  const [activeStage, setActiveStage]   = useState(UCL_STAGES[1].key);
  const [standings, setStandings]       = useState<Standing[]>([]);
  const [knockouts, setKnockouts]       = useState<any>(null);
  const [loading, setLoading]           = useState(false);

  useEffect(() => {
    setUclView('standings');
    loadStandings(activeLeague.apiId);
    if (activeLeague.apiId === 2) loadKnockouts();
  }, [activeLeague]);

  async function loadStandings(apiId: number) {
    setLoading(true);
    try {
      const data = apiId === 203 ? await getSuperLigStandings() : await getStandings(apiId);
      setStandings(data && data.length > 0 ? data : []);
    } catch { setStandings([]); }
    setLoading(false);
  }

  async function loadKnockouts() {
    try {
      const data = await getUclKnockouts(2025);
      setKnockouts(data);
    } catch { setKnockouts(null); }
  }

  const totalGames     = standings.reduce((s, r) => s + r.played, 0) / 2;
  const totalGoals     = standings.reduce((s, r) => s + r.gf, 0);
  const avgGoals       = totalGames > 0 ? totalGoals / totalGames : 0;
  const leader         = standings[0] ?? null;
  const leaderGap      = leader && standings[1] ? leader.pts - standings[1].pts : 0;
  const totalDraws     = standings.reduce((s, r) => s + r.draw, 0) / 2;
  const drawRate       = totalGames > 0 ? totalDraws / totalGames : 0;
  const ligChar        = standings.length > 0 ? getLeagueCharacter(avgGoals, drawRate) : null;
  const leaderNarr     = leader ? getLeaderNarrative(leader, standings[1]) : '';
  const avgLeagueGfPer = standings.length > 0 ? standings.reduce((s, r) => s + r.gf / Math.max(r.played, 1), 0) / standings.length : 0;
  const avgLeagueGaPer = standings.length > 0 ? standings.reduce((s, r) => s + r.ga / Math.max(r.played, 1), 0) / standings.length : 0;
  const sortedByGfR    = [...standings].sort((a, b) => b.gf / Math.max(b.played, 1) - a.gf / Math.max(a.played, 1));
  const sortedByGaR    = [...standings].sort((a, b) => a.ga / Math.max(a.played, 1) - b.ga / Math.max(b.played, 1));

  // Hücum/Savunma Gücü — lig içi min-max normalizasyon, 1.00-10.00
  const gfPer = (r: Standing) => r.played > 0 ? r.gf / r.played : 0;
  const gaPer = (r: Standing) => r.played > 0 ? r.ga / r.played : 0;
  const maxGfPer = sortedByGfR.length > 0 ? gfPer(sortedByGfR[0]) : 0;
  const minGfPer = sortedByGfR.length > 0 ? gfPer(sortedByGfR[sortedByGfR.length - 1]) : 0;
  const minGaPer = sortedByGaR.length > 0 ? gaPer(sortedByGaR[0]) : 0;
  const maxGaPer = sortedByGaR.length > 0 ? gaPer(sortedByGaR[sortedByGaR.length - 1]) : 0;
  const attackScore = (team: Standing) => maxGfPer === minGfPer
    ? 10
    : 1 + ((gfPer(team) - minGfPer) / (maxGfPer - minGfPer)) * 9;
  const defenseScore = (team: Standing) => maxGaPer === minGaPer
    ? 10
    : 1 + (1 - (gaPer(team) - minGaPer) / (maxGaPer - minGaPer)) * 9;

  const attackPower = leader ? attackScore(leader) : 1;
  const defPower    = leader ? defenseScore(leader) : 1;
  const goalScore      = Math.min(100, Math.round((avgGoals / 3.5) * 100));
  const tempoScore     = Math.min(100, Math.round(avgGoals * 28));
  const compScore      = Math.max(0, Math.min(100, 100 - leaderGap * 5));
  const surpriseScore  = Math.min(100, Math.round(drawRate * 280));
  const mostGoals      = [...standings].sort((a, b) => b.gf / Math.max(b.played, 1) - a.gf / Math.max(a.played, 1))[0] ?? null;
  const bestDef        = [...standings].sort((a, b) => a.ga / Math.max(a.played, 1) - b.ga / Math.max(b.played, 1))[0] ?? null;
  const mostTempo      = [...standings].sort((a, b) => (b.gf + b.ga) / Math.max(b.played, 1) - (a.gf + a.ga) / Math.max(a.played, 1))[0] ?? null;
  const bestWinRate    = [...standings].sort((a, b) => b.win / Math.max(b.played, 1) - a.win / Math.max(a.played, 1))[0] ?? null;
  const halfPoint      = Math.floor(standings.length / 2);
  const surpriseTeam   = [...standings].filter(r => r.pos > halfPoint).sort((a, b) => b.gf / Math.max(b.played, 1) - a.gf / Math.max(a.played, 1))[0] ?? null;
  const liderTags      = leader ? getLiderTags(leader, sortedByGfR, sortedByGaR, leaderGap) : [];

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <View style={styles.headerBrand}>
          <Image source={require('../assets/images/android-icon-foreground.png')} style={styles.headerLogo} />
          <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        </View>
        <Text style={styles.pageTitle}>Ligler</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leagueNav}
        contentContainerStyle={{ paddingHorizontal: 14 }}>
        {leagues.map(l => (
          <TouchableOpacity key={l.id}
            style={[styles.leaguePill, activeLeague.id === l.id && styles.leaguePillActive]}
            onPress={() => setActiveLeague(l)}>
            <Text style={styles.leagueFlag}>{l.flag}</Text>
            <Text style={[styles.leaguePillText, activeLeague.id === l.id && styles.leaguePillTextActive]}>{l.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.leagueHeader}>
        <Text style={styles.leagueHeaderFlag}>{activeLeague.flag}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.leagueHeaderName}>{activeLeague.name}</Text>
          <Text style={styles.leagueHeaderSub}>{activeLeague.country} · {activeLeague.season}</Text>
        </View>
        {ligChar && (
          <View style={[stStyles.ligCharBadge, { backgroundColor: ligChar.bg }]}>
            <Text style={[stStyles.ligCharBadgeText, { color: ligChar.color }]}>{ligChar.label}</Text>
          </View>
        )}
      </View>

      <View style={stStyles.subTabBar}>
        {SUB_TABS.map(t => (
          <TouchableOpacity key={t.key}
            style={[stStyles.subTab, subTab === t.key && stStyles.subTabActive]}
            onPress={() => setSubTab(t.key)}>
            <Text style={[stStyles.subTabText, subTab === t.key && stStyles.subTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#185FA5" />
        ) : (
          <>
            {/* ===== GENEL ===== */}
            {subTab === 'genel' && (
              standings.length === 0 ? (
                <Text style={styles.emptyText}>Veri yüklenemedi</Text>
              ) : (
                <>
                  {/* 1. LİG ÖZETİ */}
                  {ligChar && (
                    <View style={ozStyles.card}>
                      <Text style={ozStyles.header}>🏟️ LİG ÖZETİ</Text>
                      <View style={ozStyles.pillRow}>
                        <View style={[ozStyles.pill, { backgroundColor: '#E6F1FB' }]}>
                          <Text style={ozStyles.pillLabel}>Stil</Text>
                          <Text style={[ozStyles.pillValue, { color: '#185FA5' }]}>{ligChar.stil}</Text>
                        </View>
                        <View style={[ozStyles.pill, { backgroundColor: getTagColor(ligChar.gol).bg }]}>
                          <Text style={ozStyles.pillLabel}>Gol</Text>
                          <Text style={[ozStyles.pillValue, { color: getTagColor(ligChar.gol).color }]}>{ligChar.gol}</Text>
                        </View>
                        <View style={[ozStyles.pill, { backgroundColor: getTagColor(ligChar.tempo).bg }]}>
                          <Text style={ozStyles.pillLabel}>Tempo</Text>
                          <Text style={[ozStyles.pillValue, { color: getTagColor(ligChar.tempo).color }]}>{ligChar.tempo}</Text>
                        </View>
                        <View style={[ozStyles.pill, { backgroundColor: getTagColor(ligChar.risk).bg }]}>
                          <Text style={ozStyles.pillLabel}>Risk</Text>
                          <Text style={[ozStyles.pillValue, { color: getTagColor(ligChar.risk).color }]}>{ligChar.risk}</Text>
                        </View>
                      </View>
                      <Text style={ozStyles.ozet}>{ligChar.ozet}</Text>
                    </View>
                  )}

                  {/* 2. LİG KARAKTERİ */}
                  {ligChar && (
                    <View style={[stStyles.ligCharCard, { borderLeftColor: ligChar.color }]}>
                      <View style={stStyles.ligCharTraits}>
                        {ligChar.traits.map((t, i) => (
                          <View key={i} style={stStyles.ligCharTrait}>
                            <Text style={stStyles.ligCharTraitDot}>·</Text>
                            <Text style={stStyles.ligCharTraitText}>{t}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={stStyles.scoutScoreRow}>
                        {[
                          { label: 'Gol Pot.',  score: goalScore     },
                          { label: 'Tempo',     score: tempoScore    },
                          { label: 'Rekabet',   score: compScore     },
                          { label: 'Sürpriz',   score: surpriseScore },
                        ].map(s => (
                          <View key={s.label} style={stStyles.scoutScoreItem}>
                            <Text style={stStyles.scoutScoreVal}>{s.score}</Text>
                            <Text style={stStyles.scoutScoreLbl}>{s.label}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={stStyles.scoutRecBox}>
                        <Text style={stStyles.scoutRecLabel}>Scout Öneri</Text>
                        <Text style={stStyles.scoutRecText}>{ligChar.rec}</Text>
                      </View>
                    </View>
                  )}

                  {/* 3. ÖZETLEYİCİ SAYILAR */}
                  <View style={stStyles.summaryCard}>
                    <View style={stStyles.summaryRow}>
                      {[
                        { val: totalGoals.toString(),             lbl: 'Toplam Gol' },
                        { val: avgGoals.toFixed(2),               lbl: 'Gol/Maç'   },
                        { val: Math.round(totalGames).toString(), lbl: 'Toplam Maç' },
                      ].map(s => (
                        <View key={s.lbl} style={stStyles.summaryStat}>
                          <Text style={stStyles.summaryVal}>{s.val}</Text>
                          <Text style={stStyles.summaryLbl}>{s.lbl}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* 4. LİDER KARTI */}
                  {leader && (
                    <View style={stStyles.leaderCard}>
                      <View style={stStyles.leaderTop}>
                        <Text style={stStyles.leaderBadge}>🏆 LİDER</Text>
                        {leaderGap > 0 && <Text style={stStyles.leaderGap}>+{leaderGap} puan önde</Text>}
                      </View>
                      <Text style={stStyles.leaderTeam}>{leader.team}</Text>
                      <Text style={stStyles.leaderNarr}>{leaderNarr}</Text>
                      {liderTags.length > 0 && (
                        <View style={stStyles.liderTagRow}>
                          {liderTags.map((t, i) => (
                            <View key={i} style={[stStyles.liderTag, { backgroundColor: t.bg }]}>
                              <Text style={[stStyles.liderTagText, { color: t.color }]}>{t.label}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <View style={stStyles.leaderStats}>
                        {[
                          { v: leader.pts.toString(), l: 'Puan'      },
                          { v: leader.win.toString(), l: 'Galibiyet' },
                          { v: leader.gf.toString(),  l: 'Gol'       },
                          { v: leader.ga.toString(),  l: 'Yenilen'   },
                        ].map(s => (
                          <View key={s.l} style={stStyles.leaderStat}>
                            <Text style={stStyles.leaderStatV}>{s.v}</Text>
                            <Text style={stStyles.leaderStatL}>{s.l}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={stStyles.leaderPowerRow}>
                        <View style={stStyles.leaderPower}>
                          <Text style={stStyles.leaderPowerLbl}>Hücum Gücü</Text>
                          <Text style={stStyles.leaderPowerVal}>{attackPower.toFixed(2)}/10</Text>
                        </View>
                        <View style={stStyles.leaderPowerDiv} />
                        <View style={stStyles.leaderPower}>
                          <Text style={stStyles.leaderPowerLbl}>Savunma Gücü</Text>
                          <Text style={stStyles.leaderPowerVal}>{defPower.toFixed(2)}/10</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 5. ÖNE ÇIKAN PROFİLLER */}
                  <Text style={styles.sectionLabel}>ÖNE ÇIKAN PROFİLLER</Text>
                  {([
                    mostGoals    ? { icon: '⚽', label: 'En Golcü',        team: mostGoals,    stat: (mostGoals.gf / Math.max(mostGoals.played, 1)).toFixed(1) + ' gol/maç',           insight: 'Over 2.5 eğilimi güçlü; rakip kale her an tehlikede.' }           : null,
                    bestDef      ? { icon: '🛡️', label: 'En İyi Savunma', team: bestDef,      stat: (bestDef.ga  / Math.max(bestDef.played,   1)).toFixed(1) + ' yenilen/maç',        insight: 'Kale sıfır potansiyeli yüksek; alt bahisler için referans.' }        : null,
                    mostTempo    ? { icon: '⚡', label: 'En Tempolu',       team: mostTempo,    stat: ((mostTempo.gf + mostTempo.ga) / Math.max(mostTempo.played, 1)).toFixed(1) + ' gol/maç', insight: 'Bu takımın maçları over eğilimi için en güçlü adaylar.' } : null,
                    bestWinRate  ? { icon: '📈', label: 'En Formda',        team: bestWinRate,  stat: Math.round(bestWinRate.win / Math.max(bestWinRate.played, 1) * 100) + '% galibiyet', insight: 'Tutarlı profil — tahmin edilebilir, güvenilir seçenek.' } : null,
                    surpriseTeam ? { icon: '🌀', label: 'Sürpriz',          team: surpriseTeam, stat: surpriseTeam.pos + '. sıra · ' + (surpriseTeam.gf / Math.max(surpriseTeam.played, 1)).toFixed(1) + ' gol/maç', insight: 'Sıralama beklenenden üst — dikkatle izlenmeyi hak ediyor.' } : null,
                  ] as const).filter(Boolean).map((p, i) => p && (
                    <View key={i} style={stStyles.profileRow}>
                      <Text style={stStyles.profileIcon}>{p.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={stStyles.profileLabel}>{p.label}</Text>
                        <Text style={stStyles.profileTeam} numberOfLines={1}>{p.team.team}</Text>
                        <Text style={stStyles.profileInsight}>{p.insight}</Text>
                      </View>
                      <Text style={stStyles.profileStat}>{p.stat}</Text>
                    </View>
                  ))}

                  {/* 6. GOL VERİMLİLİĞİ */}
                  {(() => {
                    const sorted = [...standings].sort((a, b) => b.gf - a.gf);
                    const maxGf = sorted[0]?.gf || 1;
                    return (
                      <>
                        <Text style={styles.sectionLabel}>GOL VERİMLİLİĞİ</Text>
                        <Text style={styles.effSubtitle}>En fazla gol atan takım 100 birim alır, diğerleri ona oranlanır.</Text>
                        {sorted.map((row, i) => {
                          const ratio = row.gf / maxGf;
                          const color = i === 0 ? '#185FA5' : i < 3 ? '#E6A817' : i < 5 ? '#4CAF50' : '#bbb';
                          return (
                            <View key={i} style={styles.effRow}>
                              <Text style={[styles.effRank, { color }]}>{i + 1}</Text>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={styles.effTeam} numberOfLines={1}>{row.team}</Text>
                                  <View style={styles.effBarWrap}>
                                    <View style={[styles.effBarFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                                  </View>
                                  <Text style={[styles.effGoals, { color }]}>{row.gf}</Text>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </>
                    );
                  })()}

                  {/* 7. BU LİGDE NE OYNANIR? */}
                  {ligChar && (
                    <View style={ozStyles.noynanirCard}>
                      <Text style={ozStyles.noynanirHeader}>🎯 BU LİGDE NE OYNANIR?</Text>
                      {[
                        {
                          ok: avgGoals >= 2.3,
                          text: `Gol ort. ${avgGoals.toFixed(1)}/maç — ${avgGoals >= 2.8 ? 'over 2.5 eğilimi güçlü' : avgGoals >= 2.3 ? 'orta gol beklentisi' : 'alt 2.5 eğilimi baskın'}`,
                        },
                        {
                          ok: leaderGap >= 6,
                          text: leaderGap >= 8
                            ? 'Favoriler genelde kazanıyor — lider farkı belirgin'
                            : leaderGap >= 4
                            ? 'Favoriler avantajlı ama sürpriz mümkün'
                            : 'Favoriler her zaman kazanamıyor — rekabet yoğun',
                        },
                        {
                          ok: drawRate < 0.28,
                          text: `Beraberlik oranı %${Math.round(drawRate * 100)} — ${drawRate >= 0.28 ? 'yüksek, çift şans değerli' : 'düşük, net sonuçlar baskın'}`,
                        },
                        { ok: true, text: ligChar.rec },
                      ].map((b, i) => (
                        <View key={i} style={ozStyles.noynanirRow}>
                          <Text style={[ozStyles.noynanirIcon, { color: b.ok ? '#27AE60' : '#E6A817' }]}>
                            {b.ok ? '✔' : '⚠'}
                          </Text>
                          <Text style={ozStyles.noynanirText}>{b.text}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )
            )}

            {/* ===== PUAN TABLOSU ===== */}
            {subTab === 'tablo' && (
              <>
                {activeLeague.apiId === 2 && (
                  <View style={styles.uclToggle}>
                    <TouchableOpacity
                      style={[styles.uclToggleBtn, uclView === 'standings' && styles.uclToggleBtnActive]}
                      onPress={() => setUclView('standings')}>
                      <Text style={[styles.uclToggleText, uclView === 'standings' && styles.uclToggleTextActive]}>Puan Tablosu</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.uclToggleBtn, uclView === 'bracket' && styles.uclToggleBtnActive]}
                      onPress={() => setUclView('bracket')}>
                      <Text style={[styles.uclToggleText, uclView === 'bracket' && styles.uclToggleTextActive]}>🏆 Eşleşmeler</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {activeLeague.apiId === 2 && uclView === 'bracket' && (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      style={styles.stageNav} contentContainerStyle={{ paddingHorizontal: 14, gap: 6 }}>
                      {UCL_STAGES.map(s => (
                        <TouchableOpacity key={s.key}
                          style={[styles.stagePill, activeStage === s.key && styles.stagePillActive]}
                          onPress={() => setActiveStage(s.key)}>
                          <Text style={[styles.stagePillText, activeStage === s.key && styles.stagePillTextActive]}>
                            {s.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {knockouts == null ? (
                      <ActivityIndicator style={{ marginTop: 30 }} color="#185FA5" />
                    ) : (knockouts[activeStage] || []).length === 0 ? (
                      <Text style={styles.emptyText}>Bu tura ait veri bulunamadı</Text>
                    ) : (
                      groupTies(knockouts[activeStage] || []).map((tie, i) => (
                        <TieCard key={i} tie={tie} isFinal={activeStage === 'FINAL'} />
                      ))
                    )}
                  </>
                )}

                {(activeLeague.apiId !== 2 || uclView === 'standings') && (
                  standings.length === 0 ? (
                    <Text style={styles.emptyText}>Veri yüklenemedi</Text>
                  ) : (
                    <>
                      <Text style={styles.sectionLabel}>PUAN TABLOSU</Text>
                      <View style={styles.tableHeader}>
                        <Text style={styles.rankCell}>#</Text>
                        <Text style={styles.teamCell}>Takım</Text>
                        <Text style={styles.dataCell}>O</Text>
                        <Text style={styles.dataCell}>G</Text>
                        <Text style={styles.dataCell}>B</Text>
                        <Text style={styles.dataCell}>M</Text>
                        <Text style={styles.dataCell}>AG</Text>
                        <Text style={[styles.dataCell, { color: '#185FA5', fontWeight: '600' }]}>P</Text>
                      </View>
                      {standings.map((row, i) => (
                        <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                          <View style={[styles.posBadge, getBadgeStyle(row.pos, standings.length, activeLeague.apiId)]}>
                            <Text style={styles.posText}>{row.pos}</Text>
                          </View>
                          <Text style={styles.teamNameCell} numberOfLines={1}>{row.team}</Text>
                          <Text style={styles.dataCell}>{row.played}</Text>
                          <Text style={styles.dataCell}>{row.win}</Text>
                          <Text style={styles.dataCell}>{row.draw}</Text>
                          <Text style={styles.dataCell}>{row.loss}</Text>
                          <Text style={styles.dataCell}>{row.gf - row.ga > 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</Text>
                          <Text style={[styles.dataCell, { color: '#185FA5', fontWeight: '600' }]}>{row.pts}</Text>
                        </View>
                      ))}
                      <View style={styles.legendBox}>
                        <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: '#185FA5' }]} /><Text style={styles.legendText}>Şampiyonlar Ligi</Text></View>
                        <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: '#E6A817' }]} /><Text style={styles.legendText}>Avrupa Ligi</Text></View>
                        <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: '#27AE60' }]} /><Text style={styles.legendText}>Konferans Ligi</Text></View>
                        {activeLeague.apiId === 203 && (
                          <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: '#C0392B' }]} /><Text style={styles.legendText}>Küme Düşme</Text></View>
                        )}
                      </View>
                    </>
                  )
                )}
              </>
            )}

            {/* ===== TAKIMLAR ===== */}
            {subTab === 'takimlar' && (
              standings.length === 0 ? (
                <Text style={styles.emptyText}>Veri yüklenemedi</Text>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>TAKIM KİMLİKLERİ</Text>
                  <Text style={styles.effSubtitle}>Alfabetik sırada · sezon ortalamaları + karakter profili</Text>
                  {[...standings].sort((a, b) => a.team.localeCompare(b.team, 'tr')).map((row, i) => {
                    const avgGf      = row.played > 0 ? row.gf / row.played : 0;
                    const avgGa      = row.played > 0 ? row.ga / row.played : 0;
                    const winRate    = row.played > 0 ? row.win / row.played : 0;
                    const winPct     = Math.round(winRate * 100);
                    const lbl        = getTeamLabel(avgGf, avgGa, winRate, row.pos, standings.length, avgLeagueGfPer, avgLeagueGaPer);
                    const personality = getTeamPersonality(lbl.label, avgGf, avgGa, winRate);
                    const atkS       = attackScore(row);
                    const defS       = defenseScore(row);
                    return (
                      <View key={i} style={stStyles.tkCard}>
                        <View style={stStyles.tkCardTop}>
                          <View style={[styles.posBadge, getBadgeStyle(row.pos, standings.length, activeLeague.apiId)]}>
                            <Text style={styles.posText}>{row.pos}</Text>
                          </View>
                          <Text style={stStyles.tkName} numberOfLines={1}>{row.team}</Text>
                          <View style={[stStyles.tkLabel, { backgroundColor: lbl.bg }]}>
                            <Text style={[stStyles.tkLabelText, { color: lbl.color }]}>{lbl.label}</Text>
                          </View>
                        </View>
                        <Text style={stStyles.tkPersonality}>{personality}</Text>
                        <View style={stStyles.tkPowerRow}>
                          <Text style={stStyles.tkPowerText}>Hücum <Text style={stStyles.tkPowerVal}>{atkS.toFixed(2)}</Text>/10</Text>
                          <Text style={stStyles.tkPowerDot}>·</Text>
                          <Text style={stStyles.tkPowerText}>Savunma <Text style={stStyles.tkPowerVal}>{defS.toFixed(2)}</Text>/10</Text>
                        </View>
                        <View style={stStyles.tkStats}>
                          <View style={stStyles.tkStat}><Text style={stStyles.tkStatV}>{avgGf.toFixed(1)}</Text><Text style={stStyles.tkStatL}>Gol/M</Text></View>
                          <View style={stStyles.tkStat}><Text style={stStyles.tkStatV}>{avgGa.toFixed(1)}</Text><Text style={stStyles.tkStatL}>Yenilen/M</Text></View>
                          <View style={stStyles.tkStat}><Text style={stStyles.tkStatV}>{winPct}%</Text><Text style={stStyles.tkStatL}>Galibiyet</Text></View>
                          <View style={stStyles.tkStat}><Text style={stStyles.tkStatV}>{row.pts}</Text><Text style={stStyles.tkStatL}>Puan</Text></View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )
            )}

            {/* ===== TRENDLER ===== */}
            {subTab === 'trendler' && (
              standings.length === 0 ? (
                <Text style={styles.emptyText}>Veri yüklenemedi</Text>
              ) : (() => {
                const withRates = standings.map(r => ({
                  ...r,
                  gfPer:    r.played > 0 ? r.gf / r.played : 0,
                  gaPer:    r.played > 0 ? r.ga / r.played : 0,
                  tempoPer: r.played > 0 ? (r.gf + r.ga) / r.played : 0,
                  drawPer:  r.played > 0 ? r.draw / r.played : 0,
                }));

                const attackTop = [...withRates].sort((a, b) => b.gfPer - a.gfPer).slice(0, 10);
                const maxAtk    = attackTop[0]?.gfPer || 1;

                const defTop    = [...withRates].sort((a, b) => a.gaPer - b.gaPer).slice(0, 10);
                const maxDef    = defTop[defTop.length - 1]?.gaPer || 1;
                const minDef    = defTop[0]?.gaPer || 0;
                const defRange  = maxDef - minDef || 1;

                const tempoTop  = [...withRates].sort((a, b) => b.tempoPer - a.tempoPer).slice(0, 10);
                const maxTempo  = tempoTop[0]?.tempoPer || 1;

                const drawTop   = [...withRates].sort((a, b) => b.drawPer - a.drawPer).slice(0, 10);
                const maxDraw   = drawTop[0]?.drawPer || 1;

                return (
                  <>
                    <View style={stStyles.trendNote}>
                      <Text style={stStyles.trendNoteText}>
                        Maç başı {avgGoals.toFixed(2)} gol ·
                        {avgGoals >= 2.8 ? ' Yüksek tempolu lig' : avgGoals >= 2.3 ? ' Orta tempolu lig' : ' Düşük tempolu lig'}
                      </Text>
                    </View>

                    <Text style={styles.sectionLabel}>HÜCUM GÜCÜ (Gol/Maç)</Text>
                    <Text style={styles.effSubtitle}>Maç başı en fazla gol atan takımlar</Text>
                    {attackTop[0] && (
                      <View style={stStyles.insightBox}>
                        <Text style={stStyles.insightText}>
                          En golcü {attackTop[0].team}, maç başı {attackTop[0].gfPer.toFixed(1)} golle ligin hücum motorunu temsil ediyor.
                        </Text>
                        <Text style={stStyles.insightWhy}>Neden önemli: Yüksek hücum gücü, over 2.5 ve KG-var bahislerinde güçlü bir ipucu sunar.</Text>
                      </View>
                    )}
                    {attackTop.map((row, i) => {
                      const ratio = row.gfPer / maxAtk;
                      const color = i === 0 ? '#185FA5' : i < 3 ? '#E6A817' : i < 5 ? '#4CAF50' : '#bbb';
                      return (
                        <View key={i} style={styles.effRow}>
                          <Text style={[styles.effRank, { color }]}>{i + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.effTeam} numberOfLines={1}>{row.team}</Text>
                              <View style={styles.effBarWrap}>
                                <View style={[styles.effBarFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                              </View>
                              <Text style={[styles.effGoals, { color }]}>{row.gfPer.toFixed(2)}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}

                    <Text style={styles.sectionLabel}>SAVUNMA DİRENCİ (Yenilen/Maç)</Text>
                    <Text style={styles.effSubtitle}>En az gol yiyen takımlar — düşük değer daha iyi</Text>
                    {defTop[0] && (
                      <View style={stStyles.insightBox}>
                        <Text style={stStyles.insightText}>
                          {defTop[0].team} maç başı yalnızca {defTop[0].gaPer.toFixed(1)} gol yiyor — ligin en sağlam savunması.
                        </Text>
                        <Text style={stStyles.insightWhy}>Neden önemli: Az gol yiyen takımlar, alt 2.5 ve kale sıfır bahislerinde güvenilir referans noktasıdır.</Text>
                      </View>
                    )}
                    {defTop.map((row, i) => {
                      const ratio = (maxDef - row.gaPer) / defRange;
                      const color = i === 0 ? '#1B5E20' : i < 3 ? '#388E3C' : i < 5 ? '#4CAF50' : '#bbb';
                      return (
                        <View key={i} style={styles.effRow}>
                          <Text style={[styles.effRank, { color }]}>{i + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.effTeam} numberOfLines={1}>{row.team}</Text>
                              <View style={styles.effBarWrap}>
                                <View style={[styles.effBarFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                              </View>
                              <Text style={[styles.effGoals, { color }]}>{row.gaPer.toFixed(2)}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}

                    <Text style={styles.sectionLabel}>TEMPO ENDEKSİ (Toplam Gol/Maç)</Text>
                    <Text style={styles.effSubtitle}>Maçlarında en fazla toplam gol oynanan takımlar — over eğilimi göstergesi</Text>
                    {tempoTop[0] && (
                      <View style={stStyles.insightBox}>
                        <Text style={stStyles.insightText}>
                          {tempoTop[0].team} maçları bu ligde en heyecanlı seyrediyor — maç başı {tempoTop[0].tempoPer.toFixed(1)} toplam gol.
                        </Text>
                        <Text style={stStyles.insightWhy}>Neden önemli: Toplam gol ortalaması, over/alt kararlarının en doğrudan göstergesidir.</Text>
                      </View>
                    )}
                    {tempoTop.map((row, i) => {
                      const ratio  = row.tempoPer / maxTempo;
                      const isOver = row.tempoPer >= 2.5;
                      const color  = i === 0 ? '#E65100' : i < 3 ? '#F4511E' : i < 5 ? '#FF7043' : '#bbb';
                      return (
                        <View key={i} style={styles.effRow}>
                          <Text style={[styles.effRank, { color }]}>{i + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.effTeam} numberOfLines={1}>{row.team}</Text>
                              <View style={styles.effBarWrap}>
                                <View style={[styles.effBarFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                              </View>
                              <Text style={[styles.effGoals, { color }]}>{row.tempoPer.toFixed(2)}</Text>
                            </View>
                            {isOver && <Text style={styles.effLabel}>Over 2.5 eğilimi güçlü</Text>}
                          </View>
                        </View>
                      );
                    })}

                    <Text style={styles.sectionLabel}>BERABERLİK EĞİLİMİ</Text>
                    <Text style={styles.effSubtitle}>En fazla beraberlikle biten maç oynayan takımlar</Text>
                    {drawTop[0] && (
                      <View style={stStyles.insightBox}>
                        <Text style={stStyles.insightText}>
                          {drawTop[0].team} bu sezon en sık beraberlik oynayan takım — {drawTop[0].draw} kez eşit bitti, sonuç belirsizliği yüksek.
                        </Text>
                        <Text style={stStyles.insightWhy}>Neden önemli: Beraberlik eğilimi yüksek takımlar çift şans ve beraberlik bahislerinde değer yaratabilir.</Text>
                      </View>
                    )}
                    {drawTop.map((row, i) => {
                      const ratio = row.drawPer / maxDraw;
                      const color = i === 0 ? '#5b2d8e' : i < 3 ? '#7B1FA2' : i < 5 ? '#9C27B0' : '#bbb';
                      return (
                        <View key={i} style={styles.effRow}>
                          <Text style={[styles.effRank, { color }]}>{i + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.effTeam} numberOfLines={1}>{row.team}</Text>
                              <View style={styles.effBarWrap}>
                                <View style={[styles.effBarFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                              </View>
                              <Text style={[styles.effGoals, { color }]}>{row.draw}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </>
                );
              })()
            )}
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/')}><Text style={styles.tabText}>Maçlar</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tab}><Text style={[styles.tabText, styles.tabActive]}>Ligler</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/stats')}><Text style={styles.tabText}>İstatistik</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/profile')}><Text style={styles.tabText}>Profil</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#fff' },
  topbar:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8 },
  headerBrand:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogo:          { width: 42, height: 42, resizeMode: 'contain' },
  appName:             { fontSize: 16, fontWeight: '600', color: '#00BAFF' },
  appNameBlue:         { color: '#2563EB' },
  pageTitle:           { fontSize: 13, color: '#888' },
  leagueNav:           { maxHeight: 48, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  leaguePill:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, borderRadius: 20, borderWidth: 0.5, borderColor: '#ddd', gap: 4 },
  leaguePillActive:    { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  leagueFlag:          { fontSize: 14 },
  leaguePillText:      { fontSize: 12, color: '#666' },
  leaguePillTextActive:{ color: '#fff' },
  scroll:              { flex: 1 },
  leagueHeader:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  leagueHeaderFlag:    { fontSize: 32 },
  leagueHeaderName:    { fontSize: 16, fontWeight: '500', color: '#111' },
  leagueHeaderSub:     { fontSize: 12, color: '#888', marginTop: 2 },
  sectionLabel:        { fontSize: 11, color: '#888', fontWeight: '500', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, letterSpacing: 0.5 },
  emptyText:           { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 13 },
  tableHeader:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#f8f8f8', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  tableRow:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  tableRowAlt:         { backgroundColor: '#fafafa' },
  rankCell:            { fontSize: 11, color: '#888', width: 28, textAlign: 'center' },
  teamCell:            { flex: 1, fontSize: 11, color: '#888' },
  dataCell:            { fontSize: 11, color: '#888', width: 28, textAlign: 'center' },
  teamNameCell:        { flex: 1, fontSize: 12, color: '#111', fontWeight: '500' },
  posBadge:            { width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  posTop:              { backgroundColor: '#185FA5' },
  posMid:              { backgroundColor: '#E6A817' },
  posConf:             { backgroundColor: '#27AE60' },
  posRel:              { backgroundColor: '#C0392B' },
  posNormal:           { backgroundColor: '#eee' },
  posText:             { fontSize: 10, fontWeight: '600', color: '#fff' },
  legendBox:           { marginHorizontal: 14, marginTop: 12, gap: 6 },
  legendRow:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot:           { width: 10, height: 10, borderRadius: 2 },
  legendText:          { fontSize: 12, color: '#888' },
  tabBar:              { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#eee', paddingBottom: 20 },
  tab:                 { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText:             { fontSize: 12, color: '#888' },
  tabActive:           { color: '#185FA5', fontWeight: '500' },
  uclToggle:           { flexDirection: 'row', marginHorizontal: 14, marginVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden' },
  uclToggleBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center' },
  uclToggleBtnActive:  { backgroundColor: '#185FA5' },
  uclToggleText:       { fontSize: 13, color: '#888', fontWeight: '500' },
  uclToggleTextActive: { color: '#fff', fontWeight: '600' },
  stageNav:            { maxHeight: 44, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  stagePill:           { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 0.5, borderColor: '#ddd', marginRight: 6 },
  stagePillActive:     { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  stagePillText:       { fontSize: 12, color: '#666' },
  stagePillTextActive: { color: '#fff', fontWeight: '500' },
  effSubtitle:         { fontSize: 11, color: '#aaa', paddingHorizontal: 14, marginBottom: 6, marginTop: -4 },
  effRow:              { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0', gap: 8 },
  effRank:             { width: 22, fontSize: 12, fontWeight: '700', textAlign: 'center', paddingTop: 1 },
  effTeam:             { width: 110, fontSize: 12, color: '#111', fontWeight: '500' },
  effBarWrap:          { flex: 1, height: 10, backgroundColor: '#f0f0f0', borderRadius: 5, overflow: 'hidden', alignSelf: 'center' },
  effBarFill:          { height: '100%', borderRadius: 5 },
  effGoals:            { width: 28, fontSize: 12, fontWeight: '700', textAlign: 'right', alignSelf: 'center' },
  effLabel:            { fontSize: 9, color: '#aaa', marginTop: 3, paddingLeft: 2 },
});

const stStyles = StyleSheet.create({
  subTabBar:        { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eee', backgroundColor: '#fff' },
  subTab:           { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  subTabActive:     { borderBottomColor: '#185FA5' },
  subTabText:       { fontSize: 11, color: '#888' },
  subTabTextActive: { color: '#185FA5', fontWeight: '600' },
  summaryCard:      { margin: 14, padding: 14, backgroundColor: '#f8f8f8', borderRadius: 12 },
  summaryRow:       { flexDirection: 'row', marginBottom: 10 },
  summaryStat:      { flex: 1, alignItems: 'center' },
  summaryVal:       { fontSize: 20, fontWeight: '700', color: '#111' },
  summaryLbl:       { fontSize: 11, color: '#888', marginTop: 3 },
  summaryNote:      { fontSize: 11, color: '#555', lineHeight: 16, borderTopWidth: 0.5, borderTopColor: '#e0e0e0', paddingTop: 10 },
  leaderCard:       { marginHorizontal: 14, marginBottom: 6, padding: 14, backgroundColor: '#E6F1FB', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#185FA5' },
  leaderTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  leaderBadge:      { fontSize: 11, fontWeight: '700', color: '#185FA5', letterSpacing: 0.5 },
  leaderGap:        { fontSize: 11, color: '#0C447C', fontWeight: '600' },
  leaderTeam:       { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 6 },
  leaderNarr:       { fontSize: 12, color: '#555', fontStyle: 'italic', marginBottom: 10, lineHeight: 17 },
  liderTagRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  liderTag:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  liderTagText:     { fontSize: 11, fontWeight: '600' },
  leaderStats:      { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#c5d8ec', paddingTop: 10 },
  leaderStat:       { flex: 1, alignItems: 'center' },
  leaderStatV:      { fontSize: 16, fontWeight: '600', color: '#185FA5' },
  leaderStatL:      { fontSize: 10, color: '#888', marginTop: 2 },
  leaderPowerRow:   { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#c5d8ec', marginTop: 10, paddingTop: 10 },
  leaderPower:      { flex: 1, alignItems: 'center' },
  leaderPowerDiv:   { width: 0.5, backgroundColor: '#c5d8ec' },
  leaderPowerLbl:   { fontSize: 10, color: '#888', marginBottom: 3 },
  leaderPowerVal:   { fontSize: 16, fontWeight: '700', color: '#185FA5' },
  topRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0', gap: 8 },
  topTeam:          { flex: 1, fontSize: 13, color: '#111', fontWeight: '500' },
  topDetail:        { fontSize: 11, color: '#888' },
  topPts:           { fontSize: 13, fontWeight: '700', color: '#185FA5', minWidth: 36, textAlign: 'right' },
  trendNote:        { marginHorizontal: 14, marginTop: 10, marginBottom: 4, padding: 10, backgroundColor: '#f0f4ff', borderRadius: 8 },
  trendNoteText:    { fontSize: 12, color: '#333', textAlign: 'center' },
  tkCard:           { marginHorizontal: 14, marginBottom: 8, padding: 12, backgroundColor: '#fafafa', borderRadius: 10, borderWidth: 0.5, borderColor: '#eee' },
  tkCardTop:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tkName:           { flex: 1, fontSize: 13, fontWeight: '600', color: '#111' },
  tkLabel:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  tkLabelText:      { fontSize: 11, fontWeight: '600' },
  tkPersonality:    { fontSize: 11, color: '#666', fontStyle: 'italic', marginBottom: 8, lineHeight: 16 },
  tkPowerRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tkPowerText:      { fontSize: 11, color: '#555', fontWeight: '500' },
  tkPowerVal:       { color: '#0C447C', fontWeight: '700' },
  tkPowerDot:       { color: '#ccc', paddingHorizontal: 6 },
  tkStats:          { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#eee', paddingTop: 8 },
  tkStat:           { flex: 1, alignItems: 'center' },
  tkStatV:          { fontSize: 14, fontWeight: '600', color: '#111' },
  tkStatL:          { fontSize: 10, color: '#888', marginTop: 2 },
  ligCharCard:      { marginHorizontal: 14, marginTop: 6, marginBottom: 6, padding: 14, backgroundColor: '#fff', borderRadius: 12, borderWidth: 0.5, borderColor: '#e0e0e0', borderLeftWidth: 3 },
  ligCharBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  ligCharBadgeText: { fontSize: 12, fontWeight: '700' },
  ligCharTraits:    { gap: 4, marginBottom: 12 },
  ligCharTrait:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  ligCharTraitDot:  { fontSize: 14, color: '#aaa', lineHeight: 18 },
  ligCharTraitText: { fontSize: 12, color: '#444', lineHeight: 18, flex: 1 },
  scoutScoreRow:    { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#eee', paddingTop: 12, marginBottom: 12 },
  scoutScoreItem:   { flex: 1, alignItems: 'center' },
  scoutScoreVal:    { fontSize: 20, fontWeight: '700', color: '#185FA5' },
  scoutScoreLbl:    { fontSize: 10, color: '#888', marginTop: 2 },
  scoutRecBox:      { backgroundColor: '#F8F9FB', borderRadius: 8, padding: 10, borderTopWidth: 0.5, borderTopColor: '#eee' },
  scoutRecLabel:    { fontSize: 10, color: '#888', fontWeight: '600', letterSpacing: 0.4, marginBottom: 3 },
  scoutRecText:     { fontSize: 12, color: '#222', lineHeight: 17 },
  profileRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0', gap: 10 },
  profileIcon:      { fontSize: 20, width: 28, textAlign: 'center', paddingTop: 2 },
  profileLabel:     { fontSize: 10, color: '#888', fontWeight: '500', marginBottom: 2 },
  profileTeam:      { fontSize: 13, color: '#111', fontWeight: '600' },
  profileInsight:   { fontSize: 10, color: '#888', marginTop: 3, lineHeight: 14, fontStyle: 'italic' },
  profileStat:      { fontSize: 11, color: '#185FA5', fontWeight: '600', textAlign: 'right', maxWidth: 110, paddingTop: 2 },
  insightBox:       { marginHorizontal: 14, marginBottom: 6, padding: 10, backgroundColor: '#f0f4ff', borderRadius: 8, borderLeftWidth: 2, borderLeftColor: '#185FA5' },
  insightText:      { fontSize: 12, color: '#333', lineHeight: 17, fontStyle: 'italic' },
  insightWhy:       { fontSize: 11, color: '#666', marginTop: 5, lineHeight: 16 },
});

const ozStyles = StyleSheet.create({
  card:           { margin: 14, marginBottom: 8, padding: 14, backgroundColor: '#0C447C', borderRadius: 14 },
  header:         { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.5, marginBottom: 12 },
  pillRow:        { flexDirection: 'row', gap: 6, marginBottom: 14 },
  pill:           { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center' },
  pillLabel:      { fontSize: 9, color: '#888', marginBottom: 3, letterSpacing: 0.3 },
  pillValue:      { fontSize: 12, fontWeight: '700' },
  ozet:           { fontSize: 13, color: '#C8DEFF', lineHeight: 19, fontStyle: 'italic' },
  noynanirCard:   { marginHorizontal: 14, marginTop: 8, marginBottom: 8, padding: 14, backgroundColor: '#f0f4ff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#185FA5' },
  noynanirHeader: { fontSize: 12, fontWeight: '700', color: '#185FA5', letterSpacing: 0.5, marginBottom: 10 },
  noynanirRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7 },
  noynanirIcon:   { fontSize: 13, width: 18, textAlign: 'center', lineHeight: 18 },
  noynanirText:   { flex: 1, fontSize: 12, color: '#333', lineHeight: 18 },
});

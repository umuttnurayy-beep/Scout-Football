import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BottomTabBar from '../components/BottomTabBar';
import EmptyStateCard from '../components/EmptyStateCard';
import { SkeletonLeagueTable } from '../components/SkeletonLoader';
import TieCard from '../components/TieCard';
import { useTheme } from '../context/ThemeContext';
import { CURRENT_FOOTBALL_SEASON, DISPLAY_FOOTBALL_SEASON } from '../constants/seasons';
import { FDMatch, UCLKnockouts, getStandings, getSuperLigStandings, getUclKnockouts } from '../services/api';
import { leagueDataEmptyMessage } from '../utils/emptyStates';
import {
  CP, LeagueChar, LeagueStanding, Level, UCLTie,
  computeLeagueStats, cp, getTagColor, getTeamLabel, getTeamPersonality, groupTies,
} from '../utils/leagueAnalysis';

const leagues = [
  { id: 1, apiId: 39,  name: 'Premier Lig', country: 'İngiltere', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 2, apiId: 140, name: 'La Liga',     country: 'İspanya',   flag: '🇪🇸' },
  { id: 3, apiId: 78,  name: 'Bundesliga',  country: 'Almanya',   flag: '🇩🇪' },
  { id: 4, apiId: 135, name: 'Serie A',     country: 'İtalya',    flag: '🇮🇹' },
  { id: 5, apiId: 61,  name: 'Ligue 1',     country: 'Fransa',    flag: '🇫🇷' },
  { id: 6, apiId: 2,   name: 'UCL',         country: 'Avrupa',    flag: '🌍' },
  { id: 7, apiId: 203, name: 'Süper Lig',   country: 'Türkiye',   flag: '🇹🇷' },
];

const configuredLeagues = leagues.map(league => ({
  ...league,
  season: DISPLAY_FOOTBALL_SEASON,
}));

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

type League   = typeof configuredLeagues[0];
type Standing = LeagueStanding;

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
  const { colors: c, isDark } = useTheme();
  const [activeLeague, setActiveLeague] = useState<League>(configuredLeagues[0]);
  const [subTab, setSubTab]             = useState<SubTab>('genel');
  const [uclView, setUclView]           = useState<'standings' | 'bracket'>('standings');
  const [activeStage, setActiveStage]   = useState(UCL_STAGES[1].key);
  const [standings, setStandings]               = useState<Standing[]>([]);
  const [knockouts, setKnockouts]               = useState<UCLKnockouts | null>(null);
  const [loading, setLoading]                   = useState(false);
  const [refreshing, setRefreshing]             = useState(false);
  const [loadError, setLoadError]               = useState(false);
  const [knockoutsLoading, setKnockoutsLoading] = useState(false);
  const [knockoutsLoadError, setKnockoutsLoadError] = useState(false);

  useEffect(() => {
    setUclView('standings');
    setLoadError(false);
    setKnockoutsLoadError(false);
    loadStandings(activeLeague.apiId);
    if (activeLeague.apiId === 2) loadKnockouts();
  }, [activeLeague]);

  async function onRefresh() {
    setRefreshing(true);
    setLoadError(false);
    setKnockoutsLoadError(false);
    try {
      await loadStandings(activeLeague.apiId, false);
      if (activeLeague.apiId === 2) await loadKnockouts(false);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadStandings(apiId: number, showLoader = true) {
    if (showLoader) setLoading(true);
    setLoadError(false);
    try {
      const data = apiId === 203
        ? await getSuperLigStandings()
        : await getStandings(apiId);
      setStandings(data && data.length > 0 ? data : []);
    } catch {
      setStandings([]);
      setLoadError(true);
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function loadKnockouts(showLoader = true) {
    if (showLoader) setKnockoutsLoading(true);
    setKnockoutsLoadError(false);
    try {
      const data = await getUclKnockouts(CURRENT_FOOTBALL_SEASON);
      setKnockouts(data);
    } catch {
      setKnockouts(null);
      setKnockoutsLoadError(true);
    } finally {
      if (showLoader) setKnockoutsLoading(false);
    }
  }

  const retryStandings = () => loadStandings(activeLeague.apiId);
  const retryKnockouts = () => loadKnockouts();

  const {
    totalGames, totalGoals, avgGoals, leader, leaderGap, drawRate,
    ligChar, leaderNarr, avgLeagueGfPer, avgLeagueGaPer,
    sortedByGfR, sortedByGaR, attackScore, defenseScore,
    attackPower, defPower,
    goalScore, tempoScore, compScore, surpriseScore,
    mostGoals, bestDef, mostTempo, bestWinRate, surpriseTeam, liderTags,
  } = computeLeagueStats(standings, isDark);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={[styles.topbar, { backgroundColor: c.surface }]}>
        <View style={styles.headerBrand}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        </View>
        <Text style={[styles.pageTitle, { color: c.textMuted }]}>Ligler</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[styles.leagueNav, { borderBottomColor: c.border, backgroundColor: c.surface }]}
        contentContainerStyle={{ paddingHorizontal: 14 }}>
        {configuredLeagues.map(l => (
          <TouchableOpacity key={l.id}
            style={[styles.leaguePill, { borderColor: c.border }, activeLeague.id === l.id && styles.leaguePillActive]}
            onPress={() => setActiveLeague(l)}>
            <Text style={styles.leagueFlag}>{l.flag}</Text>
            <Text style={[styles.leaguePillText, { color: c.textMuted }, activeLeague.id === l.id && styles.leaguePillTextActive]}>{l.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={[styles.leagueHeader, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <Text style={styles.leagueHeaderFlag}>{activeLeague.flag}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.leagueHeaderName, { color: c.text }]}>{activeLeague.name}</Text>
          <Text style={[styles.leagueHeaderSub, { color: c.textMuted }]}>{activeLeague.country} · {activeLeague.season}</Text>
        </View>
        {ligChar && (
          <View style={[stStyles.ligCharBadge, { backgroundColor: ligChar.bg }]}>
            <Text style={[stStyles.ligCharBadgeText, { color: ligChar.color }]}>{ligChar.label}</Text>
          </View>
        )}
      </View>

      <View style={[stStyles.subTabBar, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        {SUB_TABS.map(t => (
          <TouchableOpacity key={t.key}
            style={[stStyles.subTab, subTab === t.key && stStyles.subTabActive]}
            onPress={() => setSubTab(t.key)}>
            <Text style={[stStyles.subTabText, { color: c.textMuted }, subTab === t.key && { color: c.primary, fontWeight: '600' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}
      >
        {loading ? (
          <SkeletonLeagueTable />
        ) : (
          <>
            {/* ===== GENEL ===== */}
            {subTab === 'genel' && (
              standings.length === 0 ? (
                <EmptyStateCard
                  icon="📡"
                  title={loadError ? 'Lig verisi yüklenemedi' : 'Veri bulunamadı'}
                  subtitle={leagueDataEmptyMessage(activeLeague.name)}
                  onRetry={retryStandings}
                />
              ) : (
                <>
                  {ligChar && (
                    <View style={[ozStyles.card, { backgroundColor: isDark ? '#0D2F4F' : '#0C447C' }]}>
                      <Text style={ozStyles.header}>🏟️ LİG ÖZETİ</Text>
                      <View style={ozStyles.pillRow}>
                        <View style={[ozStyles.pill, { backgroundColor: c.primaryLight }]}>
                          <Text style={[ozStyles.pillLabel, { color: c.textMuted }]}>Stil</Text>
                          <Text style={[ozStyles.pillValue, { color: c.primary }]}>{ligChar.stil}</Text>
                        </View>
                        <View style={[ozStyles.pill, { backgroundColor: getTagColor(ligChar.gol, isDark).bg }]}>
                          <Text style={[ozStyles.pillLabel, { color: c.textMuted }]}>Gol</Text>
                          <Text style={[ozStyles.pillValue, { color: getTagColor(ligChar.gol, isDark).color }]}>{ligChar.gol}</Text>
                        </View>
                        <View style={[ozStyles.pill, { backgroundColor: getTagColor(ligChar.tempo, isDark).bg }]}>
                          <Text style={[ozStyles.pillLabel, { color: c.textMuted }]}>Tempo</Text>
                          <Text style={[ozStyles.pillValue, { color: getTagColor(ligChar.tempo, isDark).color }]}>{ligChar.tempo}</Text>
                        </View>
                        <View style={[ozStyles.pill, { backgroundColor: getTagColor(ligChar.risk, isDark).bg }]}>
                          <Text style={[ozStyles.pillLabel, { color: c.textMuted }]}>Risk</Text>
                          <Text style={[ozStyles.pillValue, { color: getTagColor(ligChar.risk, isDark).color }]}>{ligChar.risk}</Text>
                        </View>
                      </View>
                      <Text style={[ozStyles.ozet, { color: isDark ? '#93C5FD' : '#C8DEFF' }]}>{ligChar.ozet}</Text>
                    </View>
                  )}

                  {ligChar && (
                    <View style={[stStyles.ligCharCard, { backgroundColor: c.surface, borderColor: c.border, borderLeftColor: ligChar.color }]}>
                      <View style={stStyles.ligCharTraits}>
                        {ligChar.traits.map((t, i) => (
                          <View key={i} style={stStyles.ligCharTrait}>
                            <Text style={[stStyles.ligCharTraitDot, { color: c.textFaint }]}>·</Text>
                            <Text style={[stStyles.ligCharTraitText, { color: c.textSub }]}>{t}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={[stStyles.scoutScoreRow, { borderTopColor: c.border }]}>
                        {[
                          { label: 'Gol Pot.',  score: goalScore     },
                          { label: 'Tempo',     score: tempoScore    },
                          { label: 'Rekabet',   score: compScore     },
                          { label: 'Sürpriz',   score: surpriseScore },
                        ].map(s => (
                          <View key={s.label} style={stStyles.scoutScoreItem}>
                            <Text style={[stStyles.scoutScoreVal, { color: c.primary }]}>{s.score}</Text>
                            <Text style={[stStyles.scoutScoreLbl, { color: c.textMuted }]}>{s.label}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={[stStyles.scoutRecBox, { backgroundColor: c.bg, borderTopColor: c.border }]}>
                        <Text style={[stStyles.scoutRecLabel, { color: c.textMuted }]}>Scout Öneri</Text>
                        <Text style={[stStyles.scoutRecText, { color: c.text }]}>{ligChar.rec}</Text>
                      </View>
                    </View>
                  )}

                  <View style={[stStyles.summaryCard, { backgroundColor: c.surfaceAlt }]}>
                    <View style={stStyles.summaryRow}>
                      {[
                        { val: totalGoals.toString(),             lbl: 'Toplam Gol' },
                        { val: avgGoals.toFixed(2),               lbl: 'Gol/Maç'   },
                        { val: Math.round(totalGames).toString(), lbl: 'Toplam Maç' },
                      ].map(s => (
                        <View key={s.lbl} style={stStyles.summaryStat}>
                          <Text style={[stStyles.summaryVal, { color: c.text }]}>{s.val}</Text>
                          <Text style={[stStyles.summaryLbl, { color: c.textMuted }]}>{s.lbl}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {leader && (
                    <View style={[stStyles.leaderCard, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
                      <View style={stStyles.leaderTop}>
                        <Text style={[stStyles.leaderBadge, { color: c.primary }]}>🏆 LİDER</Text>
                        {leaderGap > 0 && <Text style={[stStyles.leaderGap, { color: c.primary }]}>+{leaderGap} puan önde</Text>}
                      </View>
                      <Text style={[stStyles.leaderTeam, { color: c.text }]}>{leader.team}</Text>
                      <Text style={[stStyles.leaderNarr, { color: c.textSub }]}>{leaderNarr}</Text>
                      {liderTags.length > 0 && (
                        <View style={stStyles.liderTagRow}>
                          {liderTags.map((t, i) => (
                            <View key={i} style={[stStyles.liderTag, { backgroundColor: t.bg }]}>
                              <Text style={[stStyles.liderTagText, { color: t.color }]}>{t.label}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <View style={[stStyles.leaderStats, { borderTopColor: c.cardBorder }]}>
                        {[
                          { v: leader.pts.toString(), l: 'Puan'      },
                          { v: leader.win.toString(), l: 'Galibiyet' },
                          { v: leader.gf.toString(),  l: 'Gol'       },
                          { v: leader.ga.toString(),  l: 'Yenilen'   },
                        ].map(s => (
                          <View key={s.l} style={stStyles.leaderStat}>
                            <Text style={[stStyles.leaderStatV, { color: c.primary }]}>{s.v}</Text>
                            <Text style={[stStyles.leaderStatL, { color: c.textMuted }]}>{s.l}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={[stStyles.leaderPowerRow, { borderTopColor: c.cardBorder }]}>
                        <View style={stStyles.leaderPower}>
                          <Text style={[stStyles.leaderPowerLbl, { color: c.textMuted }]}>Hücum Gücü</Text>
                          <Text style={[stStyles.leaderPowerVal, { color: c.primary }]}>{attackPower.toFixed(2)}/10</Text>
                        </View>
                        <View style={[stStyles.leaderPowerDiv, { backgroundColor: c.cardBorder }]} />
                        <View style={stStyles.leaderPower}>
                          <Text style={[stStyles.leaderPowerLbl, { color: c.textMuted }]}>Savunma Gücü</Text>
                          <Text style={[stStyles.leaderPowerVal, { color: c.primary }]}>{defPower.toFixed(2)}/10</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <Text style={[styles.sectionLabel, { color: c.textMuted }]}>ÖNE ÇIKAN PROFİLLER</Text>
                  {([
                    mostGoals    ? { icon: '⚽', label: 'En Golcü',        team: mostGoals,    stat: (mostGoals.gf / Math.max(mostGoals.played, 1)).toFixed(1) + ' gol/maç',           insight: 'Over 2.5 eğilimi güçlü; rakip kale her an tehlikede.' }           : null,
                    bestDef      ? { icon: '🛡️', label: 'En İyi Savunma', team: bestDef,      stat: (bestDef.ga  / Math.max(bestDef.played,   1)).toFixed(1) + ' yenilen/maç',        insight: 'Kale sıfır potansiyeli yüksek; düşük skorlu senaryolar için referans.' }        : null,
                    mostTempo    ? { icon: '⚡', label: 'En Tempolu',       team: mostTempo,    stat: ((mostTempo.gf + mostTempo.ga) / Math.max(mostTempo.played, 1)).toFixed(1) + ' gol/maç', insight: 'Bu takımın maçları over eğilimi için en güçlü adaylar.' } : null,
                    bestWinRate  ? { icon: '📈', label: 'En Formda',        team: bestWinRate,  stat: Math.round(bestWinRate.win / Math.max(bestWinRate.played, 1) * 100) + '% galibiyet', insight: 'Tutarlı profil — tahmin edilebilir, güvenilir seçenek.' } : null,
                    surpriseTeam ? { icon: '🌀', label: 'Sürpriz',          team: surpriseTeam, stat: surpriseTeam.pos + '. sıra · ' + (surpriseTeam.gf / Math.max(surpriseTeam.played, 1)).toFixed(1) + ' gol/maç', insight: 'Sıralama beklenenden üst — dikkatle izlenmeyi hak ediyor.' } : null,
                  ] as const).filter(Boolean).map((p, i) => p && (
                    <View key={i} style={[stStyles.profileRow, { borderBottomColor: c.borderLight }]}>
                      <Text style={stStyles.profileIcon}>{p.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[stStyles.profileLabel, { color: c.textMuted }]}>{p.label}</Text>
                        <Text style={[stStyles.profileTeam, { color: c.text }]} numberOfLines={1}>{p.team.team}</Text>
                        <Text style={[stStyles.profileInsight, { color: c.textMuted }]}>{p.insight}</Text>
                      </View>
                      <Text style={[stStyles.profileStat, { color: c.primary }]}>{p.stat}</Text>
                    </View>
                  ))}

                  {(() => {
                    const sorted = [...standings].sort((a, b) => b.gf - a.gf);
                    const maxGf = sorted[0]?.gf || 1;
                    return (
                      <>
                        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>GOL VERİMLİLİĞİ</Text>
                        <Text style={[styles.effSubtitle, { color: c.textFaint }]}>En fazla gol atan takım 100 birim alır, diğerleri ona oranlanır.</Text>
                        {sorted.map((row, i) => {
                          const ratio = row.gf / maxGf;
                          const color = i === 0 ? c.primary : i < 3 ? '#E6A817' : i < 5 ? '#4CAF50' : c.textVeryFaint;
                          return (
                            <View key={i} style={[styles.effRow, { borderBottomColor: c.borderLight }]}>
                              <Text style={[styles.effRank, { color }]}>{i + 1}</Text>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={[styles.effTeam, { color: c.text }]} numberOfLines={1}>{row.team}</Text>
                                  <View style={[styles.effBarWrap, { backgroundColor: c.border }]}>
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

                  {ligChar && (
                    <View style={[ozStyles.noynanirCard, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
                      <Text style={[ozStyles.noynanirHeader, { color: c.primary }]}>🎯 BU LİGDE NE OYNANIR?</Text>
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
                          <Text style={[ozStyles.noynanirText, { color: c.text }]}>{b.text}</Text>
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
                  <View style={[styles.uclToggle, { borderColor: c.border }]}>
                    <TouchableOpacity
                      style={[styles.uclToggleBtn, uclView === 'standings' && styles.uclToggleBtnActive]}
                      onPress={() => setUclView('standings')}>
                      <Text style={[styles.uclToggleText, { color: c.textMuted }, uclView === 'standings' && styles.uclToggleTextActive]}>Puan Tablosu</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.uclToggleBtn, uclView === 'bracket' && styles.uclToggleBtnActive]}
                      onPress={() => setUclView('bracket')}>
                      <Text style={[styles.uclToggleText, { color: c.textMuted }, uclView === 'bracket' && styles.uclToggleTextActive]}>🏆 Eşleşmeler</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {activeLeague.apiId === 2 && uclView === 'bracket' && (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      style={[styles.stageNav, { borderBottomColor: c.border }]} contentContainerStyle={{ paddingHorizontal: 14, gap: 6 }}>
                      {UCL_STAGES.map(s => (
                        <TouchableOpacity key={s.key}
                          style={[styles.stagePill, { borderColor: c.border }, activeStage === s.key && styles.stagePillActive]}
                          onPress={() => setActiveStage(s.key)}>
                          <Text style={[styles.stagePillText, { color: c.textMuted }, activeStage === s.key && styles.stagePillTextActive]}>
                            {s.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {knockoutsLoading ? (
                      <SkeletonLeagueTable />
                    ) : knockoutsLoadError ? (
                      <EmptyStateCard icon="📡" title="Eşleşme verisi yüklenemedi" onRetry={retryKnockouts} />
                    ) : knockouts == null ? (
                      <EmptyStateCard icon="🏆" title="UCL eşleşme verisi bulunamadı" onRetry={retryKnockouts} />
                    ) : (knockouts[activeStage] || []).length === 0 ? (
                      <EmptyStateCard icon="🏆" title="Bu tura ait veri bulunamadı" onRetry={retryKnockouts} />
                    ) : (
                      groupTies(knockouts[activeStage] || []).map((tie, i) => (
                        <TieCard key={i} tie={tie} isFinal={activeStage === 'FINAL'} />
                      ))
                    )}
                  </>
                )}

                {(activeLeague.apiId !== 2 || uclView === 'standings') && (
                  standings.length === 0 ? (
                    <EmptyStateCard
                      icon="📡"
                      title={loadError ? 'Puan tablosu yüklenemedi' : 'Veri bulunamadı'}
                      subtitle={leagueDataEmptyMessage(activeLeague.name)}
                      onRetry={retryStandings}
                    />
                  ) : (
                    <>
                      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>PUAN TABLOSU</Text>
                      <View style={[styles.tableHeader, { backgroundColor: c.surfaceAlt, borderBottomColor: c.border }]}>
                        <Text style={[styles.rankCell, { color: c.textMuted }]}>#</Text>
                        <Text style={[styles.teamCell, { color: c.textMuted }]}>Takım</Text>
                        <Text style={[styles.dataCell, { color: c.textMuted }]}>O</Text>
                        <Text style={[styles.dataCell, { color: c.textMuted }]}>G</Text>
                        <Text style={[styles.dataCell, { color: c.textMuted }]}>B</Text>
                        <Text style={[styles.dataCell, { color: c.textMuted }]}>M</Text>
                        <Text style={[styles.dataCell, { color: c.textMuted }]}>AG</Text>
                        <Text style={[styles.dataCell, { color: c.primary, fontWeight: '600' }]}>P</Text>
                      </View>
                      {standings.map((row, i) => (
                        <View key={i} style={[styles.tableRow, { borderBottomColor: c.borderLight }, i % 2 === 0 && { backgroundColor: c.surfaceAlt }]}>
                          <View style={[styles.posBadge, getBadgeStyle(row.pos, standings.length, activeLeague.apiId)]}>
                            <Text style={styles.posText}>{row.pos}</Text>
                          </View>
                          <Text style={[styles.teamNameCell, { color: c.text }]} numberOfLines={1}>{row.team}</Text>
                          <Text style={[styles.dataCell, { color: c.textMuted }]}>{row.played}</Text>
                          <Text style={[styles.dataCell, { color: c.textMuted }]}>{row.win}</Text>
                          <Text style={[styles.dataCell, { color: c.textMuted }]}>{row.draw}</Text>
                          <Text style={[styles.dataCell, { color: c.textMuted }]}>{row.loss}</Text>
                          <Text style={[styles.dataCell, { color: c.textMuted }]}>{row.gf - row.ga > 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</Text>
                          <Text style={[styles.dataCell, { color: c.primary, fontWeight: '600' }]}>{row.pts}</Text>
                        </View>
                      ))}
                      <View style={styles.legendBox}>
                        <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: '#185FA5' }]} /><Text style={[styles.legendText, { color: c.textMuted }]}>Şampiyonlar Ligi</Text></View>
                        <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: '#E6A817' }]} /><Text style={[styles.legendText, { color: c.textMuted }]}>Avrupa Ligi</Text></View>

                        {activeLeague.apiId === 203 && (
                          <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: '#C0392B' }]} /><Text style={[styles.legendText, { color: c.textMuted }]}>Küme Düşme</Text></View>
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
                <EmptyStateCard
                  icon="🏟️"
                  title={loadError ? 'Takım verisi yüklenemedi' : 'Veri bulunamadı'}
                  subtitle={leagueDataEmptyMessage(activeLeague.name)}
                  onRetry={retryStandings}
                />
              ) : (
                <>
                  <Text style={[styles.sectionLabel, { color: c.textMuted }]}>TAKIM KİMLİKLERİ</Text>
                  <Text style={[styles.effSubtitle, { color: c.textFaint }]}>Alfabetik sırada · sezon ortalamaları + karakter profili</Text>
                  {[...standings].sort((a, b) => a.team.localeCompare(b.team, 'tr')).map((row, i) => {
                    const avgGf      = row.played > 0 ? row.gf / row.played : 0;
                    const avgGa      = row.played > 0 ? row.ga / row.played : 0;
                    const winRate    = row.played > 0 ? row.win / row.played : 0;
                    const winPct     = Math.round(winRate * 100);
                    const lbl        = getTeamLabel(avgGf, avgGa, winRate, row.pos, standings.length, avgLeagueGfPer, avgLeagueGaPer, isDark);
                    const personality = getTeamPersonality(lbl.label, avgGf, avgGa, winRate, avgLeagueGfPer);
                    const atkS       = attackScore(row);
                    const defS       = defenseScore(row);
                    return (
                      <View key={i} style={[stStyles.tkCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                        <View style={stStyles.tkCardTop}>
                          <View style={[styles.posBadge, getBadgeStyle(row.pos, standings.length, activeLeague.apiId)]}>
                            <Text style={styles.posText}>{row.pos}</Text>
                          </View>
                          <Text style={[stStyles.tkName, { color: c.text }]} numberOfLines={1}>{row.team}</Text>
                          <View style={[stStyles.tkLabel, { backgroundColor: lbl.bg }]}>
                            <Text style={[stStyles.tkLabelText, { color: lbl.color }]}>{lbl.label}</Text>
                          </View>
                        </View>
                        <Text style={[stStyles.tkPersonality, { color: c.textSub }]}>{personality}</Text>
                        <View style={stStyles.tkPowerRow}>
                          <Text style={[stStyles.tkPowerText, { color: c.textSub }]}>Hücum <Text style={[stStyles.tkPowerVal, { color: c.primary }]}>{atkS.toFixed(2)}</Text>/10</Text>
                          <Text style={[stStyles.tkPowerDot, { color: c.textVeryFaint }]}>·</Text>
                          <Text style={[stStyles.tkPowerText, { color: c.textSub }]}>Savunma <Text style={[stStyles.tkPowerVal, { color: c.primary }]}>{defS.toFixed(2)}</Text>/10</Text>
                        </View>
                        <View style={[stStyles.tkStats, { borderTopColor: c.border }]}>
                          <View style={stStyles.tkStat}><Text style={[stStyles.tkStatV, { color: c.text }]}>{avgGf.toFixed(1)}</Text><Text style={[stStyles.tkStatL, { color: c.textMuted }]}>Gol/M</Text></View>
                          <View style={stStyles.tkStat}><Text style={[stStyles.tkStatV, { color: c.text }]}>{avgGa.toFixed(1)}</Text><Text style={[stStyles.tkStatL, { color: c.textMuted }]}>Yenilen/M</Text></View>
                          <View style={stStyles.tkStat}><Text style={[stStyles.tkStatV, { color: c.text }]}>{winPct}%</Text><Text style={[stStyles.tkStatL, { color: c.textMuted }]}>Galibiyet</Text></View>
                          <View style={stStyles.tkStat}><Text style={[stStyles.tkStatV, { color: c.text }]}>{row.pts}</Text><Text style={[stStyles.tkStatL, { color: c.textMuted }]}>Puan</Text></View>
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
                <EmptyStateCard
                  icon="📊"
                  title={loadError ? 'Trend verisi yüklenemedi' : 'Veri bulunamadı'}
                  subtitle={leagueDataEmptyMessage(activeLeague.name)}
                  onRetry={retryStandings}
                />
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
                    <View style={[stStyles.trendNote, { backgroundColor: c.primaryLight }]}>
                      <Text style={[stStyles.trendNoteText, { color: c.text }]}>
                        Maç başı {avgGoals.toFixed(2)} gol ·
                        {avgGoals >= 2.8 ? ' Yüksek tempolu lig' : avgGoals >= 2.3 ? ' Orta tempolu lig' : ' Düşük tempolu lig'}
                      </Text>
                    </View>

                    <Text style={[styles.sectionLabel, { color: c.textMuted }]}>HÜCUM GÜCÜ (Gol/Maç)</Text>
                    <Text style={[styles.effSubtitle, { color: c.textFaint }]}>Maç başı en fazla gol atan takımlar</Text>
                    {attackTop[0] && (
                      <View style={[stStyles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
                        <Text style={[stStyles.insightText, { color: c.text }]}>
                          En golcü {attackTop[0].team}, maç başı {attackTop[0].gfPer.toFixed(1)} golle ligin hücum motorunu temsil ediyor.
                        </Text>
                        <Text style={[stStyles.insightWhy, { color: c.textSub }]}>Neden önemli: Yüksek hücum gücü, 2.5 üst ve KG-var senaryolarında güçlü bir ipucu sunar.</Text>
                      </View>
                    )}
                    {attackTop.map((row, i) => {
                      const ratio = row.gfPer / maxAtk;
                      const color = i === 0 ? c.primary : i < 3 ? '#E6A817' : i < 5 ? '#4CAF50' : c.textVeryFaint;
                      return (
                        <View key={i} style={[styles.effRow, { borderBottomColor: c.borderLight }]}>
                          <Text style={[styles.effRank, { color }]}>{i + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.effTeam, { color: c.text }]} numberOfLines={1}>{row.team}</Text>
                              <View style={[styles.effBarWrap, { backgroundColor: c.border }]}>
                                <View style={[styles.effBarFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                              </View>
                              <Text style={[styles.effGoals, { color }]}>{row.gfPer.toFixed(2)}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}

                    <Text style={[styles.sectionLabel, { color: c.textMuted }]}>SAVUNMA DİRENCİ (Yenilen/Maç)</Text>
                    <Text style={[styles.effSubtitle, { color: c.textFaint }]}>En az gol yiyen takımlar — düşük değer daha iyi</Text>
                    {defTop[0] && (
                      <View style={[stStyles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
                        <Text style={[stStyles.insightText, { color: c.text }]}>
                          {defTop[0].team} maç başı yalnızca {defTop[0].gaPer.toFixed(1)} gol yiyor — ligin en sağlam savunması.
                        </Text>
                        <Text style={[stStyles.insightWhy, { color: c.textSub }]}>Neden önemli: Az gol yiyen takımlar, alt 2.5 ve kale sıfır senaryolarında güvenilir referans noktasıdır.</Text>
                      </View>
                    )}
                    {defTop.map((row, i) => {
                      const ratio = (maxDef - row.gaPer) / defRange;
                      const color = i === 0 ? '#1B5E20' : i < 3 ? '#388E3C' : i < 5 ? '#4CAF50' : c.textVeryFaint;
                      return (
                        <View key={i} style={[styles.effRow, { borderBottomColor: c.borderLight }]}>
                          <Text style={[styles.effRank, { color }]}>{i + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.effTeam, { color: c.text }]} numberOfLines={1}>{row.team}</Text>
                              <View style={[styles.effBarWrap, { backgroundColor: c.border }]}>
                                <View style={[styles.effBarFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                              </View>
                              <Text style={[styles.effGoals, { color }]}>{row.gaPer.toFixed(2)}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}

                    <Text style={[styles.sectionLabel, { color: c.textMuted }]}>TEMPO ENDEKSİ (Toplam Gol/Maç)</Text>
                    <Text style={[styles.effSubtitle, { color: c.textFaint }]}>Maçlarında en fazla toplam gol oynanan takımlar — over eğilimi göstergesi</Text>
                    {tempoTop[0] && (
                      <View style={[stStyles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
                        <Text style={[stStyles.insightText, { color: c.text }]}>
                          {tempoTop[0].team} maçları bu ligde en heyecanlı seyrediyor — maç başı {tempoTop[0].tempoPer.toFixed(1)} toplam gol.
                        </Text>
                        <Text style={[stStyles.insightWhy, { color: c.textSub }]}>Neden önemli: Toplam gol ortalaması, over/alt kararlarının en doğrudan göstergesidir.</Text>
                      </View>
                    )}
                    {tempoTop.map((row, i) => {
                      const ratio  = row.tempoPer / maxTempo;
                      const isOver = row.tempoPer >= 2.5;
                      const color  = i === 0 ? '#E65100' : i < 3 ? '#F4511E' : i < 5 ? '#FF7043' : c.textVeryFaint;
                      return (
                        <View key={i} style={[styles.effRow, { borderBottomColor: c.borderLight }]}>
                          <Text style={[styles.effRank, { color }]}>{i + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.effTeam, { color: c.text }]} numberOfLines={1}>{row.team}</Text>
                              <View style={[styles.effBarWrap, { backgroundColor: c.border }]}>
                                <View style={[styles.effBarFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
                              </View>
                              <Text style={[styles.effGoals, { color }]}>{row.tempoPer.toFixed(2)}</Text>
                            </View>
                            {isOver && <Text style={[styles.effLabel, { color: c.textFaint }]}>Over 2.5 eğilimi güçlü</Text>}
                          </View>
                        </View>
                      );
                    })}

                    <Text style={[styles.sectionLabel, { color: c.textMuted }]}>BERABERLİK EĞİLİMİ</Text>
                    <Text style={[styles.effSubtitle, { color: c.textFaint }]}>En fazla beraberlikle biten maç oynayan takımlar</Text>
                    {drawTop[0] && (
                      <View style={[stStyles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
                        <Text style={[stStyles.insightText, { color: c.text }]}>
                          {drawTop[0].team} bu sezon en sık beraberlik oynayan takım — {drawTop[0].draw} kez eşit bitti, sonuç belirsizliği yüksek.
                        </Text>
                        <Text style={[stStyles.insightWhy, { color: c.textSub }]}>Neden önemli: Beraberlik eğilimi yüksek takımlar sonuç belirsizliği ve çift ihtimal senaryolarında öne çıkar.</Text>
                      </View>
                    )}
                    {drawTop.map((row, i) => {
                      const ratio = row.drawPer / maxDraw;
                      const color = i === 0 ? '#5b2d8e' : i < 3 ? '#7B1FA2' : i < 5 ? '#9C27B0' : c.textVeryFaint;
                      return (
                        <View key={i} style={[styles.effRow, { borderBottomColor: c.borderLight }]}>
                          <Text style={[styles.effRank, { color }]}>{i + 1}</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.effTeam, { color: c.text }]} numberOfLines={1}>{row.team}</Text>
                              <View style={[styles.effBarWrap, { backgroundColor: c.border }]}>
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

      <BottomTabBar activeTab="leagues" />
    </View>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1 },
  topbar:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8 },
  headerBrand:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogo:          { width: 42, height: 42, resizeMode: 'contain' },
  appName:             { fontSize: 16, fontWeight: '600', color: '#00BAFF' },
  appNameBlue:         { color: '#2563EB' },
  pageTitle:           { fontSize: 13 },
  leagueNav:           { maxHeight: 48, borderBottomWidth: 0.5 },
  leaguePill:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, borderRadius: 20, borderWidth: 0.5, gap: 4 },
  leaguePillActive:    { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  leagueFlag:          { fontSize: 14 },
  leaguePillText:      { fontSize: 12 },
  leaguePillTextActive:{ color: '#fff' },
  scroll:              { flex: 1 },
  leagueHeader:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5 },
  leagueHeaderFlag:    { fontSize: 32 },
  leagueHeaderName:    { fontSize: 16, fontWeight: '500' },
  leagueHeaderSub:     { fontSize: 12, marginTop: 2 },
  sectionLabel:        { fontSize: 11, fontWeight: '500', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, letterSpacing: 0.5 },
  emptyText:           { textAlign: 'center', marginTop: 40, fontSize: 13 },
  tableHeader:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 0.5 },
  tableRow:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 0.5 },
  tableRowAlt:         {},
  rankCell:            { fontSize: 11, width: 28, textAlign: 'center' },
  teamCell:            { flex: 1, fontSize: 11 },
  dataCell:            { fontSize: 11, width: 28, textAlign: 'center' },
  teamNameCell:        { flex: 1, fontSize: 12, fontWeight: '500' },
  posBadge:            { width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  posTop:              { backgroundColor: '#185FA5' },
  posMid:              { backgroundColor: '#E6A817' },
  posConf:             { backgroundColor: '#27AE60' },
  posRel:              { backgroundColor: '#C0392B' },
  posNormal:           { backgroundColor: '#888' },
  posText:             { fontSize: 10, fontWeight: '600', color: '#fff' },
  legendBox:           { marginHorizontal: 14, marginTop: 12, gap: 6 },
  legendRow:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot:           { width: 10, height: 10, borderRadius: 2 },
  legendText:          { fontSize: 12 },
  uclToggle:           { flexDirection: 'row', marginHorizontal: 14, marginVertical: 10, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  uclToggleBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center' },
  uclToggleBtnActive:  { backgroundColor: '#185FA5' },
  uclToggleText:       { fontSize: 13, fontWeight: '500' },
  uclToggleTextActive: { color: '#fff', fontWeight: '600' },
  stageNav:            { maxHeight: 44, borderBottomWidth: 0.5 },
  stagePill:           { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 0.5, marginRight: 6 },
  stagePillActive:     { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  stagePillText:       { fontSize: 12 },
  stagePillTextActive: { color: '#fff', fontWeight: '500' },
  effSubtitle:         { fontSize: 11, paddingHorizontal: 14, marginBottom: 6, marginTop: -4 },
  effRow:              { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 0.5, gap: 8 },
  effRank:             { width: 22, fontSize: 12, fontWeight: '700', textAlign: 'center', paddingTop: 1 },
  effTeam:             { width: 110, fontSize: 12, fontWeight: '500' },
  effBarWrap:          { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', alignSelf: 'center' },
  effBarFill:          { height: '100%', borderRadius: 5 },
  effGoals:            { width: 28, fontSize: 12, fontWeight: '700', textAlign: 'right', alignSelf: 'center' },
  effLabel:            { fontSize: 9, marginTop: 3, paddingLeft: 2 },
});

const stStyles = StyleSheet.create({
  subTabBar:        { flexDirection: 'row', borderBottomWidth: 0.5 },
  subTab:           { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  subTabActive:     { borderBottomColor: '#185FA5' },
  subTabText:       { fontSize: 11 },
  summaryCard:      { margin: 14, padding: 14, borderRadius: 12 },
  summaryRow:       { flexDirection: 'row', marginBottom: 10 },
  summaryStat:      { flex: 1, alignItems: 'center' },
  summaryVal:       { fontSize: 20, fontWeight: '700' },
  summaryLbl:       { fontSize: 11, marginTop: 3 },
  summaryNote:      { fontSize: 11, lineHeight: 16, borderTopWidth: 0.5, paddingTop: 10 },
  leaderCard:       { marginHorizontal: 14, marginBottom: 6, padding: 14, borderRadius: 12, borderLeftWidth: 3 },
  leaderTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  leaderBadge:      { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  leaderGap:        { fontSize: 11, fontWeight: '600' },
  leaderTeam:       { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  leaderNarr:       { fontSize: 12, fontStyle: 'italic', marginBottom: 10, lineHeight: 17 },
  liderTagRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  liderTag:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  liderTagText:     { fontSize: 11, fontWeight: '600' },
  leaderStats:      { flexDirection: 'row', borderTopWidth: 0.5, paddingTop: 10 },
  leaderStat:       { flex: 1, alignItems: 'center' },
  leaderStatV:      { fontSize: 16, fontWeight: '600' },
  leaderStatL:      { fontSize: 10, marginTop: 2 },
  leaderPowerRow:   { flexDirection: 'row', borderTopWidth: 0.5, marginTop: 10, paddingTop: 10 },
  leaderPower:      { flex: 1, alignItems: 'center' },
  leaderPowerDiv:   { width: 0.5 },
  leaderPowerLbl:   { fontSize: 10, marginBottom: 3 },
  leaderPowerVal:   { fontSize: 16, fontWeight: '700' },
  topRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, gap: 8 },
  topTeam:          { flex: 1, fontSize: 13, fontWeight: '500' },
  topDetail:        { fontSize: 11 },
  topPts:           { fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  trendNote:        { marginHorizontal: 14, marginTop: 10, marginBottom: 4, padding: 10, borderRadius: 8 },
  trendNoteText:    { fontSize: 12, textAlign: 'center' },
  tkCard:           { marginHorizontal: 14, marginBottom: 8, padding: 12, borderRadius: 10, borderWidth: 0.5 },
  tkCardTop:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tkName:           { flex: 1, fontSize: 13, fontWeight: '600' },
  tkLabel:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  tkLabelText:      { fontSize: 11, fontWeight: '600' },
  tkPersonality:    { fontSize: 11, fontStyle: 'italic', marginBottom: 8, lineHeight: 16 },
  tkPowerRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tkPowerText:      { fontSize: 11, fontWeight: '500' },
  tkPowerVal:       { fontWeight: '700' },
  tkPowerDot:       { paddingHorizontal: 6 },
  tkStats:          { flexDirection: 'row', borderTopWidth: 0.5, paddingTop: 8 },
  tkStat:           { flex: 1, alignItems: 'center' },
  tkStatV:          { fontSize: 14, fontWeight: '600' },
  tkStatL:          { fontSize: 10, marginTop: 2 },
  ligCharCard:      { marginHorizontal: 14, marginTop: 6, marginBottom: 6, padding: 14, borderRadius: 12, borderWidth: 0.5, borderLeftWidth: 3 },
  ligCharBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  ligCharBadgeText: { fontSize: 12, fontWeight: '700' },
  ligCharTraits:    { gap: 4, marginBottom: 12 },
  ligCharTrait:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  ligCharTraitDot:  { fontSize: 14, lineHeight: 18 },
  ligCharTraitText: { fontSize: 12, lineHeight: 18, flex: 1 },
  scoutScoreRow:    { flexDirection: 'row', borderTopWidth: 0.5, paddingTop: 12, marginBottom: 12 },
  scoutScoreItem:   { flex: 1, alignItems: 'center' },
  scoutScoreVal:    { fontSize: 20, fontWeight: '700' },
  scoutScoreLbl:    { fontSize: 10, marginTop: 2 },
  scoutRecBox:      { borderRadius: 8, padding: 10, borderTopWidth: 0.5 },
  scoutRecLabel:    { fontSize: 10, fontWeight: '600', letterSpacing: 0.4, marginBottom: 3 },
  scoutRecText:     { fontSize: 12, lineHeight: 17 },
  profileRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, gap: 10 },
  profileIcon:      { fontSize: 20, width: 28, textAlign: 'center', paddingTop: 2 },
  profileLabel:     { fontSize: 10, fontWeight: '500', marginBottom: 2 },
  profileTeam:      { fontSize: 13, fontWeight: '600' },
  profileInsight:   { fontSize: 10, marginTop: 3, lineHeight: 14, fontStyle: 'italic' },
  profileStat:      { fontSize: 11, fontWeight: '600', textAlign: 'right', maxWidth: 110, paddingTop: 2 },
  insightBox:       { marginHorizontal: 14, marginBottom: 6, padding: 10, borderRadius: 8, borderLeftWidth: 2 },
  insightText:      { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  insightWhy:       { fontSize: 11, marginTop: 5, lineHeight: 16 },
});

const ozStyles = StyleSheet.create({
  card:           { margin: 14, marginBottom: 8, padding: 14, backgroundColor: '#0C447C', borderRadius: 14 },
  header:         { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.5, marginBottom: 12 },
  pillRow:        { flexDirection: 'row', gap: 6, marginBottom: 14 },
  pill:           { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center' },
  pillLabel:      { fontSize: 9, color: '#888', marginBottom: 3, letterSpacing: 0.3 },
  pillValue:      { fontSize: 12, fontWeight: '700' },
  ozet:           { fontSize: 13, color: '#C8DEFF', lineHeight: 19, fontStyle: 'italic' },
  noynanirCard:   { marginHorizontal: 14, marginTop: 8, marginBottom: 8, padding: 14, borderRadius: 12, borderLeftWidth: 3 },
  noynanirHeader: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  noynanirRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7 },
  noynanirIcon:   { fontSize: 13, width: 18, textAlign: 'center', lineHeight: 18 },
  noynanirText:   { flex: 1, fontSize: 12, lineHeight: 18 },
});

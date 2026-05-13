import { Stack, useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import BottomTabBar from '../components/BottomTabBar';
import { useTheme } from '../context/ThemeContext';
import { getSuperLigMatch, getMatchStats } from '../services/api';
import {
  SavedPick, clearPickHistory, filterPicksForWeek, groupPicksByDay,
  getWeekRange, getMaxWeekOffset, getUnlockDateLabel,
  loadPickHistory, pickAccuracy, resolvePickResults, removeStalePicks,
} from '../utils/pickHistory';

const DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function ToneChip({ tone, label }: { tone: string; label: string }) {
  const { colors: c, isDark } = useTheme();
  const color =
    tone === 'home'    ? c.primary :
    tone === 'away'    ? c.loss :
    tone === 'goals'   ? (isDark ? '#E3B341' : '#B7791F') :
    tone === 'caution' ? (isDark ? '#F85149' : '#A32D2D') :
    (isDark ? '#C19BFF' : '#5b2d8e');
  return (
    <View style={[styles.chip, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function PickCard({ pick }: { pick: SavedPick }) {
  const { colors: c } = useTheme();
  const hasResult = pick.result !== undefined;
  const correct = pick.result?.correct;
  const icon = hasResult ? (correct ? '✓' : '✗') : '⏳';
  const iconColor = hasResult ? (correct ? c.win : c.loss) : c.textFaint;
  const scoreLabel = hasResult ? `${pick.result!.homeScore}–${pick.result!.awayScore}` : 'Bekleniyor';

  return (
    <View style={[styles.pickCard, { backgroundColor: c.surface }]}>
      <View style={[styles.pickStatus, { borderColor: iconColor }]}>
        <Text style={[styles.pickStatusIcon, { color: iconColor }]}>{icon}</Text>
      </View>
      <View style={styles.pickCardBody}>
        <Text style={[styles.pickTeams, { color: c.text }]} numberOfLines={1}>
          {pick.homeTeam} – {pick.awayTeam}
        </Text>
        <ToneChip tone={pick.pickTone} label={pick.pickLabel} />
        <Text style={[styles.pickScore, { color: c.textFaint }]}>{scoreLabel}</Text>
      </View>
    </View>
  );
}

export default function ScoutPerformanceScreen() {
  const router = useRouter();
  const { colors: c, isDark } = useTheme();
  const [weekOffset, setWeekOffset] = useState(getMaxWeekOffset);
  const [allPicks, setAllPicks] = useState<SavedPick[]>([]);
  const [resolving, setResolving] = useState(false);

  const week = getWeekRange(weekOffset);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await removeStalePicks();
        const history = await loadPickHistory();
        if (!cancelled) {
          setAllPicks(history);
          const maxOffset = getMaxWeekOffset();
          // maxOffset'i aşan offset varsa sıfırla
          setWeekOffset(prev => Math.min(prev, maxOffset));
          // Görülebilecek en son hafta boşsa geriye dönük en fazla 8 hafta ara
          const targetWeek = getWeekRange(maxOffset);
          const targetPicks = filterPicksForWeek(history, targetWeek.start, targetWeek.end)
            .filter(p => p.pickTone !== 'caution');
          if (targetPicks.length === 0) {
            for (let o = maxOffset - 1; o >= maxOffset - 8; o--) {
              const w = getWeekRange(o);
              const wPicks = filterPicksForWeek(history, w.start, w.end)
                .filter(p => p.pickTone !== 'caution');
              if (wPicks.length > 0) { setWeekOffset(o); break; }
            }
          }
        }

        setResolving(true);
        await resolvePickResults(async (pick) => {
          try {
            if (pick.isSuperLig) {
              const event = await getSuperLigMatch(pick.id);
              if (!event) return null;
              const finished = ['FT', 'AET', 'PEN', 'Match Finished'].includes(event.strStatus || '');
              if (!finished) return null;
              const h = Number(event.intHomeScore);
              const a = Number(event.intAwayScore);
              return Number.isFinite(h) && Number.isFinite(a) ? { home: h, away: a } : null;
            } else {
              const data = await getMatchStats(pick.id);
              if (!data || data.status !== 'FINISHED') return null;
              const h = data.score?.fullTime?.home;
              const a = data.score?.fullTime?.away;
              return typeof h === 'number' && typeof a === 'number' ? { home: h, away: a } : null;
            }
          } catch { return null; }
        });

        const updated = await loadPickHistory();
        if (!cancelled) setAllPicks(updated);
        setResolving(false);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const maxWeekOffset = getMaxWeekOffset();
  const isPendingMonday = maxWeekOffset === -1 && weekOffset === -1;

  const weekPicks = filterPicksForWeek(allPicks, week.start, week.end)
    .filter(p => p.pickTone !== 'caution');
  const acc = pickAccuracy(weekPicks);
  const pending = weekPicks.filter(p => !p.result).length;
  const grouped = groupPicksByDay(weekPicks);

  const isLatestWeek = weekOffset >= maxWeekOffset;
  const isDefaultWeek = weekOffset === maxWeekOffset;
  const barPct = acc.total > 0 ? acc.pct : 0;
  const barColor = barPct >= 60 ? c.win : barPct >= 40 ? (isDark ? '#E3B341' : '#B7791F') : c.loss;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.backBtn, { color: c.primary }]}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>Scout Performansı</Text>
        <View style={{ width: 52 }} />
      </View>

      {/* Week navigator */}
      <View style={[styles.weekNav, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={styles.weekNavBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.weekNavArrow, { color: c.primary }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.weekNavCenter}>
          <Text style={[styles.weekLabel, { color: c.text }]}>{week.label}</Text>
          {isDefaultWeek && <Text style={[styles.weekBadge, { color: c.primary }]}>Geçen Hafta</Text>}
        </View>
        <TouchableOpacity
          onPress={() => setWeekOffset(w => Math.min(maxWeekOffset, w + 1))}
          style={styles.weekNavBtn}
          disabled={isLatestWeek}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.weekNavArrow, { color: isLatestWeek ? c.textFaint : c.primary }]}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Accuracy summary */}
        {acc.total > 0 ? (
          <View style={[styles.accCard, { backgroundColor: c.surface }]}>
            <View style={styles.accRow}>
              <View>
                <Text style={[styles.accBig, { color: c.text }]}>
                  {acc.correct}
                  <Text style={[styles.accOf, { color: c.textMuted }]}>/{acc.total}</Text>
                </Text>
                <Text style={[styles.accSub, { color: c.textSub }]}>isabetli tahmin</Text>
              </View>
              <Text style={[styles.accPct, { color: barColor }]}>%{acc.pct}</Text>
            </View>
            <View style={[styles.barBg, { backgroundColor: c.borderLight }]}>
              <View style={[styles.barFill, { width: `${barPct}%`, backgroundColor: barColor }]} />
            </View>
            {pending > 0 && (
              <Text style={[styles.resolveHint, { color: c.textFaint }]}>{pending} maç sonucu bekleniyor</Text>
            )}
            {resolving && (
              <Text style={[styles.resolveHint, { color: c.textFaint }]}>Sonuçlar güncelleniyor…</Text>
            )}
          </View>
        ) : weekPicks.length > 0 ? (
          <View style={[styles.accCard, { backgroundColor: c.surface }]}>
            <View style={styles.accRow}>
              <View>
                <Text style={[styles.accBig, { color: c.text }]}>{weekPicks.length}</Text>
                <Text style={[styles.accSub, { color: c.textSub }]}>pick takipte</Text>
              </View>
              <Text style={[styles.accPct, { color: c.textFaint }]}>⏳</Text>
            </View>
            <Text style={[styles.resolveHint, { color: c.textFaint, marginTop: 0 }]}>
              Sonuçlar güncelleniyor…
            </Text>
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.emptyIcon]}>📋</Text>
            {isPendingMonday ? (
              <>
                <Text style={[styles.emptyTitle, { color: c.text }]}>Geçen haftanın sonuçları hazırlanıyor</Text>
                <Text style={[styles.emptySub, { color: c.textSub }]}>
                  Saat 09:00'dan itibaren geçen haftanın scout performansı burada görünecek.
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.emptyTitle, { color: c.text }]}>Bu hafta için pick bulunamadı</Text>
                <Text style={[styles.emptySub, { color: c.textSub }]}>
                  Ana ekranda o haftanın maçlarını görüntüleyince Scout pick'leri otomatik kaydedilir.
                </Text>
              </>
            )}
          </View>
        )}

        {/* Day-by-day picks */}
        {grouped.map(({ date, picks: dayPicks }) => (
          <View key={date}>
            <Text style={[styles.dayHeader, { color: c.textMuted }]}>{formatDate(date)}</Text>
            {dayPicks.map(pick => (
              <PickCard key={pick.id} pick={pick} />
            ))}
          </View>
        ))}

        {/* Clear button */}
        {allPicks.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={async () => { await clearPickHistory(); setAllPicks([]); }}
          >
            <Text style={[styles.clearBtnText, { color: c.loss }]}>Tüm pick geçmişini temizle</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      <BottomTabBar activeTab="matches" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  backBtn: { fontSize: 17, fontWeight: '500', minWidth: 52 },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 0.5,
  },
  weekNavBtn: { paddingHorizontal: 12 },
  weekNavArrow: { fontSize: 24, fontWeight: '300' },
  weekNavCenter: { alignItems: 'center', flex: 1 },
  weekLabel: { fontSize: 15, fontWeight: '600' },
  weekBadge: { fontSize: 11, fontWeight: '500', marginTop: 2 },

  scroll: { paddingTop: 12, paddingHorizontal: 14 },

  accCard: { borderRadius: 14, padding: 16, marginBottom: 16 },
  accRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  accBig: { fontSize: 36, fontWeight: '800', lineHeight: 40 },
  accOf: { fontSize: 22, fontWeight: '600' },
  accSub: { fontSize: 13, marginTop: 2 },
  accPct: { fontSize: 32, fontWeight: '800' },
  barBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  resolveHint: { fontSize: 11, marginTop: 8, textAlign: 'right' },

  emptyCard: { borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 16 },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },

  dayHeader: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },

  pickCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12,
    padding: 12, marginBottom: 8,
  },
  pickStatus: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  pickStatusIcon: { fontSize: 14, fontWeight: '800' },
  pickCardBody: { flex: 1, gap: 4 },
  pickTeams: { fontSize: 13, fontWeight: '700' },
  pickScore: { fontSize: 12 },

  chip: { alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: '600' },

  clearBtn: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  clearBtnText: { fontSize: 13 },
});

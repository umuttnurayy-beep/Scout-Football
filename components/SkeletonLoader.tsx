import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// ─── base animated box ────────────────────────────────────────────────────────

function SkeletonBox({
  width,
  height,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  style?: ViewStyle;
}) {
  const { isDark } = useTheme();
  const anim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    ).start();
    return () => anim.stopAnimation();
  }, [anim]);

  return (
    <Animated.View
      style={[
        {
          width: width ?? '100%',
          height,
          borderRadius: 6,
          backgroundColor: isDark ? '#2D3139' : '#E4EAF0',
          opacity: anim,
        },
        style,
      ]}
    />
  );
}

// ─── match card skeleton ──────────────────────────────────────────────────────

export function SkeletonMatchCard() {
  const { colors: c } = useTheme();
  return (
    <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={s.topRow}>
        <SkeletonBox width="40%" height={11} />
        <SkeletonBox width={34} height={11} />
      </View>
      <View style={s.teamsRow}>
        <SkeletonBox width="36%" height={15} />
        <SkeletonBox width={18} height={13} style={{ marginHorizontal: 6 }} />
        <SkeletonBox width="36%" height={15} />
      </View>
      <SkeletonBox width="58%" height={11} style={{ marginTop: 9 }} />
    </View>
  );
}

// ─── section header skeleton ──────────────────────────────────────────────────

export function SkeletonSectionHeader() {
  const { colors: c } = useTheme();
  return (
    <View style={[s.sectionHeader, { backgroundColor: c.bg }]}>
      <SkeletonBox width={130} height={12} />
    </View>
  );
}

// ─── stat row skeleton (team_stats bölüm başları için) ────────────────────────

export function SkeletonStatBlock() {
  const { colors: c } = useTheme();
  return (
    <View style={[s.statBlock, { backgroundColor: c.surface, borderColor: c.border }]}>
      <SkeletonBox width="35%" height={12} style={{ marginBottom: 14 }} />
      <View style={s.statRow}>
        <SkeletonBox width="28%" height={32} />
        <SkeletonBox width="28%" height={32} />
        <SkeletonBox width="28%" height={32} />
      </View>
      <SkeletonBox width="100%" height={10} style={{ marginTop: 14, borderRadius: 5 }} />
    </View>
  );
}

// ─── player list skeleton ─────────────────────────────────────────────────────

export function SkeletonPlayerList() {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: 12 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={i} style={[s.playerRow, { borderBottomColor: c.border }]}>
          <SkeletonBox width={28} height={28} style={{ borderRadius: 14 }} />
          <View style={{ flex: 1, marginLeft: 10, gap: 6 }}>
            <SkeletonBox width="55%" height={12} />
            <SkeletonBox width="30%" height={10} />
          </View>
          <SkeletonBox width={24} height={24} style={{ borderRadius: 12 }} />
        </View>
      ))}
    </View>
  );
}

// ─── match detail skeleton ───────────────────────────────────────────────────

export function SkeletonMatchDetail() {
  const { colors: c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* hero card */}
      <View style={[s.detailHero, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={s.detailTeamsRow}>
          <SkeletonBox width="34%" height={16} />
          <SkeletonBox width={44} height={28} style={{ marginHorizontal: 8, borderRadius: 6 }} />
          <SkeletonBox width="34%" height={16} />
        </View>
        <View style={s.detailBadgeRow}>
          <SkeletonBox width={80} height={22} style={{ borderRadius: 11 }} />
          <SkeletonBox width={100} height={22} style={{ borderRadius: 11 }} />
        </View>
      </View>
      {/* scout summary card */}
      <View style={[s.detailCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <SkeletonBox width={120} height={13} style={{ marginBottom: 12 }} />
        <SkeletonBox width="90%" height={12} style={{ marginBottom: 8 }} />
        <SkeletonBox width="75%" height={12} style={{ marginBottom: 8 }} />
        <SkeletonBox width="55%" height={12} />
      </View>
      {/* stats card */}
      <View style={[s.detailCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <SkeletonBox width={100} height={13} style={{ marginBottom: 12 }} />
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[s.detailStatRow, { borderBottomColor: c.border }]}>
            <SkeletonBox width={32} height={13} />
            <SkeletonBox width="45%" height={8} style={{ borderRadius: 4 }} />
            <SkeletonBox width={32} height={13} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── team list skeleton (team_detail.tsx için) ───────────────────────────────

export function SkeletonTeamList() {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: 4 }}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <View key={i} style={[s.teamRow, { borderBottomColor: c.borderLight }]}>
          <SkeletonBox width={36} height={36} style={{ borderRadius: 8 }} />
          <SkeletonBox width="50%" height={13} style={{ marginLeft: 10, flex: 1 }} />
          <SkeletonBox width={28} height={11} style={{ marginLeft: 8 }} />
        </View>
      ))}
    </View>
  );
}

// ─── league table skeleton ────────────────────────────────────────────────────

export function SkeletonLeagueTable() {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: 8 }}>
      {/* header row */}
      <View style={[s.tableRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <SkeletonBox width={14} height={10} />
        <SkeletonBox width="45%" height={10} style={{ marginLeft: 10 }} />
        <SkeletonBox width={20} height={10} />
        <SkeletonBox width={20} height={10} />
        <SkeletonBox width={20} height={10} />
        <SkeletonBox width={24} height={10} />
      </View>
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <View key={i} style={[s.tableRow, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
          <SkeletonBox width={14} height={12} />
          <SkeletonBox width="42%" height={12} style={{ marginLeft: 10 }} />
          <SkeletonBox width={18} height={12} />
          <SkeletonBox width={18} height={12} />
          <SkeletonBox width={18} height={12} />
          <SkeletonBox width={22} height={14} />
        </View>
      ))}
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  topRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  teamsRow:    { flexDirection: 'row', alignItems: 'center' },
  sectionHeader: { paddingHorizontal: 14, paddingVertical: 10, marginBottom: 2 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  statBlock: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  statRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  detailHero: {
    padding: 20,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  detailTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  detailBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  detailCard: {
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  detailStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
});

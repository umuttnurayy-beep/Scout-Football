import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function CompareRow({ label, homeVal, awayVal, higherIsBetter = true }: {
  label: string; homeVal: number | string; awayVal: number | string; higherIsBetter?: boolean;
}) {
  const { colors: cc } = useTheme();

  const h = parseFloat(String(homeVal));
  const a = parseFloat(String(awayVal));
  const hValid = isFinite(h);
  const aValid = isFinite(a);

  const hWins = hValid && aValid && (higherIsBetter ? h > a : h < a);
  const aWins = hValid && aValid && (higherIsBetter ? a > h : a < h);

  // Flex ratios for the bar — use abs values, clamp min to avoid 0-flex collapse
  const hFlex = Math.max(hValid ? Math.abs(h) : 1, 0.01);
  const aFlex = Math.max(aValid ? Math.abs(a) : 1, 0.01);

  const hColor = hWins ? cc.primary : cc.borderLight;
  const aColor = aWins ? cc.loss   : cc.borderLight;

  return (
    <View style={styles.wrap}>
      {/* Values + label row */}
      <View style={styles.row}>
        <Text
          style={[styles.val, { color: hWins ? cc.primary : cc.textMuted, fontWeight: hWins ? '700' : '400', fontSize: hWins ? 15 : 14 }]}
          numberOfLines={1}
        >
          {homeVal}
        </Text>
        <Text style={[styles.lbl, { color: cc.textMuted }]}>{label}</Text>
        <Text
          style={[styles.val, { color: aWins ? cc.loss : cc.textMuted, fontWeight: aWins ? '700' : '400', fontSize: aWins ? 15 : 14, textAlign: 'right' }]}
          numberOfLines={1}
        >
          {awayVal}
        </Text>
      </View>

      {/* Dual-bar */}
      <View style={styles.barContainer}>
        <View style={[styles.barSeg, { flex: hFlex, backgroundColor: hColor }]} />
        <View style={styles.barDivider} />
        <View style={[styles.barSeg, { flex: aFlex, backgroundColor: aColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:         { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  row:          { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  val:          { width: 72, fontSize: 14 },
  lbl:          { flex: 1, fontSize: 11, textAlign: 'center' },
  barContainer: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden' },
  barSeg:       { height: '100%' },
  barDivider:   { width: 2, height: '100%', backgroundColor: 'transparent' },
});

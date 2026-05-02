import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function CompareRow({ label, homeVal, awayVal, higherIsBetter = true }: {
  label: string; homeVal: number | string; awayVal: number | string; higherIsBetter?: boolean;
}) {
  const { colors: cc } = useTheme();
  const h=parseFloat(String(homeVal)), a=parseFloat(String(awayVal));
  const hW=higherIsBetter?h>a:h<a, aW=higherIsBetter?a>h:a<h;
  return (
    <View style={[styles.row, { borderBottomColor: cc.borderLight }]}>
      <Text style={[styles.val, { color: cc.textMuted }, hW && { color: cc.primary, fontWeight: '700', fontSize: 16 }]}>{homeVal}</Text>
      <Text style={[styles.lbl, { color: cc.textMuted }]}>{label}</Text>
      <Text style={[styles.val, { color: cc.textMuted }, aW && { color: cc.loss, fontWeight: '700', fontSize: 16 }]}>{awayVal}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 0.5 },
  val: { width: 56, fontSize: 14, textAlign: 'center' },
  lbl: { flex: 1, fontSize: 11, textAlign: 'center' },
});

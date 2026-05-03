import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type RefreshStatusBarProps = {
  message?: string;
};

export const REFRESH_STATUS_MESSAGES = {
  default: 'Veriler yenileniyor...',
  matches: 'Maç verileri yenileniyor...',
  leagues: 'Lig verileri yenileniyor...',
} as const;

export default function RefreshStatusBar({ message = REFRESH_STATUS_MESSAGES.default }: RefreshStatusBarProps) {
  const { colors: c } = useTheme();
  return (
    <View style={[s.bar, { backgroundColor: c.surface, borderTopColor: c.borderLight, borderBottomColor: c.borderLight }]}>
      <ActivityIndicator size="small" color={c.primary} />
      <Text style={[s.text, { color: c.textSub }]} numberOfLines={1}>{message}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
});

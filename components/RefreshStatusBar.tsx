import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type RefreshStatusBarProps = {
  message?: string;
};

export default function RefreshStatusBar({ message = 'Veriler yenileniyor...' }: RefreshStatusBarProps) {
  const { colors: c } = useTheme();
  return (
    <View style={[s.bar, { backgroundColor: c.surface, borderBottomColor: c.borderLight }]}>
      <ActivityIndicator size="small" color={c.primary} />
      <Text style={[s.text, { color: c.textSub }]}>{message}</Text>
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
    borderBottomWidth: 0.5,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
});

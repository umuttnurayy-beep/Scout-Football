import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type Props = {
  icon: string;
  title: string;
  subtitle?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
};

export default function EmptyStateCard({
  icon,
  title,
  subtitle,
  onRetry,
  retryLabel = 'Tekrar Dene',
  compact = false,
}: Props) {
  const { colors: c, isDark } = useTheme();

  if (compact) {
    return (
      <View style={[s.compact, { backgroundColor: isDark ? c.surface : '#F7F9FC', borderColor: c.border }]}>
        <Text style={s.compactIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.compactTitle, { color: c.text }]}>{title}</Text>
          {subtitle ? <Text style={[s.compactSub, { color: c.textSub }]}>{subtitle}</Text> : null}
        </View>
        {onRetry ? (
          <TouchableOpacity onPress={onRetry} style={[s.retryPill, { borderColor: c.primary }]} activeOpacity={0.7}>
            <Text style={[s.retryPillText, { color: c.primary }]}>{retryLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={s.full}>
      <Text style={s.icon}>{icon}</Text>
      <Text style={[s.title, { color: c.text }]}>{title}</Text>
      {subtitle ? <Text style={[s.subtitle, { color: c.textSub }]}>{subtitle}</Text> : null}
      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          style={[s.retryBtn, { backgroundColor: c.primary }]}
          activeOpacity={0.8}
        >
          <Text style={s.retryBtnText}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  full: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  icon:     { fontSize: 44, marginBottom: 14 },
  title:    { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 4,
  },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginVertical: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  compactIcon:  { fontSize: 22 },
  compactTitle: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  compactSub:   { fontSize: 12, lineHeight: 16 },
  retryPill: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  retryPillText: { fontSize: 12, fontWeight: '600' },
});

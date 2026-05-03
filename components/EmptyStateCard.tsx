import React from 'react';
import { Ionicons } from '@expo/vector-icons';
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
            <Ionicons name="refresh" size={13} color={c.primary} />
            <Text style={[s.retryPillText, { color: c.primary }]} numberOfLines={1}>{retryLabel}</Text>
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
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={s.retryBtnText}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  full: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  icon:     { fontSize: 44, marginBottom: 14 },
  title:    { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 4,
    minHeight: 40,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minHeight: 30,
    flexShrink: 0,
  },
  retryPillText: { fontSize: 12, fontWeight: '600' },
});

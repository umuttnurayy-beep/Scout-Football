import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  icon: IoniconName;
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
  const { colors: c } = useTheme();

  if (compact) {
    return (
      <View style={[s.compact, { backgroundColor: c.surfaceAlt, borderColor: c.borderLight }]}>
        <Ionicons name={icon} size={22} color={c.textMuted} />
        <View style={s.compactCopy}>
          <Text style={[s.compactTitle, { color: c.text }]} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={[s.compactSub, { color: c.textSub }]} numberOfLines={2}>{subtitle}</Text> : null}
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
      <View style={[s.iconWrap, { backgroundColor: c.surfaceAlt }]}>
        <Ionicons name={icon} size={32} color={c.textMuted} />
      </View>
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
  iconWrap:  { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
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
    minHeight: 58,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  compactCopy:  { flex: 1, minWidth: 0 },
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
    maxWidth: 132,
  },
  retryPillText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
});

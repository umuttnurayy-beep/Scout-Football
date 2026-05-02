import React from 'react';
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type DetailDataNoticeProps = {
  message: string;
  boxStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function DetailDataNotice({ message, boxStyle, textStyle }: DetailDataNoticeProps) {
  const { colors: c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.surfaceAlt }, boxStyle]}>
      <Text style={[{ color: c.textSub }, textStyle]}>{message}</Text>
    </View>
  );
}

type DetailSectionTitleProps = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
};

export function DetailSectionTitle({ children, style }: DetailSectionTitleProps) {
  const { colors: c } = useTheme();
  return <Text style={[{ color: c.textMuted }, style]}>{children}</Text>;
}

type DetailInsightBoxProps = {
  message?: string;
  children?: React.ReactNode;
  accentColor?: string;
  textColor?: string;
  boxStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function DetailInsightBox({ message, children, accentColor, textColor, boxStyle, textStyle }: DetailInsightBoxProps) {
  const { colors: c } = useTheme();
  const contentColor = textColor ?? c.text;
  return (
    <View style={[{ backgroundColor: c.primaryLight, borderLeftColor: accentColor ?? c.primary }, boxStyle]}>
      {message !== undefined ? <Text style={[{ color: contentColor }, textStyle]}>{message}</Text> : children}
    </View>
  );
}

type DetailStatusBannerProps = {
  message: string;
  boxStyle: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
};

export function DetailStatusBanner({ message, boxStyle, textStyle }: DetailStatusBannerProps) {
  return (
    <View style={boxStyle}>
      <Text style={textStyle}>{message}</Text>
    </View>
  );
}

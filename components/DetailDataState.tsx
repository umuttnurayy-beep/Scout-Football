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

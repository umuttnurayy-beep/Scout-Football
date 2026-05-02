import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

export default function ShotGauge({ shotsOn, shotsTotal }: { shotsOn: number; shotsTotal: number }) {
  const { colors: sc, isDark } = useTheme();
  const W=140,H=92,cx=W/2,cy=H-8,R=52;
  const ratio=shotsTotal>0?Math.min(Math.max(shotsOn/shotsTotal,0.001),0.999):0.001;
  const angle=(1-ratio)*Math.PI;
  const eax=cx+R*Math.cos(angle), eay=cy-R*Math.sin(angle);
  const gc=ratio>=0.65?'#2E7D32':ratio>=0.4?'#E65100':'#B71C1C';
  const lbl=ratio>=0.65?'Bitiricilik Yüksek':ratio>=0.4?'Tehlikeli Hücum':'İsabet Düşük';
  const nx=cx+(R-7)*Math.cos(angle), ny=cy-(R-7)*Math.sin(angle);
  const needleColor = isDark ? '#C9D1D9' : '#333';
  const trackColor  = isDark ? '#30363D' : '#e8e8e8';
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Svg width={W} height={H}>
        <Path d={`M ${cx-R},${cy} A ${R},${R},0,0,0,${cx+R},${cy}`} fill="none" stroke={trackColor} strokeWidth={12} strokeLinecap="round"/>
        {shotsTotal>0&&<Path d={`M ${cx-R},${cy} A ${R},${R},0,0,0,${eax},${eay}`} fill="none" stroke={gc} strokeWidth={12} strokeLinecap="round"/>}
        <Line x1={cx} y1={cy} x2={nx} y2={ny} stroke={needleColor} strokeWidth={2.5} strokeLinecap="round"/>
        <Circle cx={cx} cy={cy} r={5} fill={needleColor}/>
        <SvgText x={cx} y={cy-20} textAnchor="middle" fontSize={14} fontWeight="bold" fill={gc}>{shotsTotal>0?`${Math.round(ratio*100)}%`:'-'}</SvgText>
      </Svg>
      <Text style={{ fontSize: 11, fontWeight: '600', color: gc, marginTop: -4, textAlign: 'center' }}>{shotsTotal>0?lbl:'Veri Yok'}</Text>
      <Text style={{ fontSize: 10, color: sc.textMuted, marginTop: 2 }}>{shotsOn}/{shotsTotal} isabetli</Text>
    </View>
  );
}

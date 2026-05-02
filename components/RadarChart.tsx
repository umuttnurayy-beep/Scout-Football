import React from 'react';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

const NEON = '#00E676';

export default function RadarChart({ homeVals, awayVals, labels }: { homeVals: number[]; awayVals: number[]; labels: string[] }) {
  const { colors: rc, isDark } = useTheme();
  const SIZE=240,cx=SIZE/2,cy=SIZE/2+4,maxR=80,n=labels.length;
  const toRad=(deg:number)=>deg*(Math.PI/180);
  const angles=Array.from({length:n},(_,i)=>toRad(-90+(360/n)*i));
  const pt=(a:number,r:number)=>({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)});
  const toPath=(vals:number[])=>vals.map((v,i)=>{const{x,y}=pt(angles[i],Math.min(Math.max(v,0),1)*maxR);return`${i===0?'M':'L'}${x},${y}`;}).join(' ')+'Z';
  const rings=[0.25,0.5,0.75,1.0];
  const hSum=homeVals.reduce((s,v)=>s+v,0);
  const aSum=awayVals.reduce((s,v)=>s+v,0);
  const hLeads=hSum>=aSum;
  const hS=hLeads?NEON:rc.primary;
  const aS=!hLeads?NEON:rc.loss;
  const hF=hLeads?'rgba(0,230,118,0.18)':isDark?'rgba(88,166,255,0.12)':'rgba(24,95,165,0.12)';
  const aF=!hLeads?'rgba(0,230,118,0.18)':isDark?'rgba(248,81,73,0.12)':'rgba(163,45,45,0.12)';
  const gridStroke=isDark?'#30363D':'#eee';
  const labelFill=isDark?'#8B949E':'#444';
  return (
    <Svg width={SIZE} height={SIZE}>
      {rings.map(r=>(
        <Polygon key={r} points={angles.map(a=>{const p=pt(a,r*maxR);return`${p.x},${p.y}`;}).join(' ')} fill="none" stroke={gridStroke} strokeWidth={1}/>
      ))}
      {angles.map((a,i)=>{const tip=pt(a,maxR);return<Line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke={gridStroke} strokeWidth={1}/>;  })}
      <Path d={toPath(awayVals)} fill={aF} stroke={aS} strokeWidth={hLeads?1.5:2.5}/>
      <Path d={toPath(homeVals)} fill={hF} stroke={hS} strokeWidth={hLeads?2.5:1.5}/>
      {angles.map((a,i)=>{
        const tip=pt(a,maxR+24);
        return<SvgText key={i} x={tip.x} y={tip.y} textAnchor="middle" fontSize={11} fontWeight="600" fill={labelFill}>{labels[i]}</SvgText>;
      })}
      {homeVals.map((v,i)=>{const{x,y}=pt(angles[i],Math.min(Math.max(v,0),1)*maxR);return<Circle key={i} cx={x} cy={y} r={3.5} fill={hS}/>;  })}
      {awayVals.map((v,i)=>{const{x,y}=pt(angles[i],Math.min(Math.max(v,0),1)*maxR);return<Circle key={i} cx={x} cy={y} r={3.5} fill={aS}/>;  })}
    </Svg>
  );
}

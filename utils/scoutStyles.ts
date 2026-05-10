import { StyleSheet } from 'react-native';
import { SP } from './spacing';

const scoutStyles = StyleSheet.create({
  // ── shared section / insight styles ─────────────────────────────────────────
  sectionLabel: {
    fontSize: 11, fontWeight: '500', letterSpacing: 0.5,
    paddingHorizontal: SP.sectionPx, paddingTop: SP.sectionPt, paddingBottom: SP.sectionPb,
  },
  insightBox: {
    marginHorizontal: SP.insightMx, marginBottom: SP.insightMb,
    padding: SP.insightP, borderRadius: SP.insightR, borderLeftWidth: SP.insightBw,
    alignSelf: 'stretch',
  },
  insightText: { width: '100%', flexShrink: 1, flexWrap: 'wrap', fontSize: 12, lineHeight: 17 },
  // ── match-card analysis styles ───────────────────────────────────────────────
  card:           { backgroundColor:'#f4f0ff', borderBottomWidth:0.5, borderBottomColor:'#ddd6ff', paddingHorizontal:14, paddingTop:12, paddingBottom:12 },
  headerRow:      { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:9 },
  headerLabel:    { fontSize:11, fontWeight:'700', color:'#5b2d8e', letterSpacing:0.6 },
  guvenPill:      { borderRadius:20, paddingLeft:9, paddingRight:5, paddingVertical:3, flexDirection:'row', alignItems:'center', gap:4 },
  guvenText:      { fontSize:10, fontWeight:'600' },
  metricsRow:     { flexDirection:'row', gap:7, marginBottom:9 },
  metricItem:     { flex:1, borderRadius:8, paddingVertical:7, paddingHorizontal:4, alignItems:'center' },
  metricLabelRow: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, marginBottom:3 },
  metricLabel:    { fontSize:9, color:'#666' },
  metricVal:      { fontSize:12, fontWeight:'700' },
  metricHelpBtn:  { width:15, height:15, borderRadius:8, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(255,255,255,0.12)' },
  metricHelpText: { fontSize:10, fontWeight:'900', lineHeight:13 },
  inlineHelpBtn:  { width:16, height:16, borderRadius:8, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(255,255,255,0.12)' },
  inlineHelpText: { fontSize:10, fontWeight:'900', lineHeight:13 },
  helpBox:        { borderWidth:0.5, borderRadius:10, padding:9, marginTop:-1, marginBottom:9 },
  helpText:       { fontSize:11, lineHeight:16 },
  helpStrong:     { fontWeight:'800' },
  mediumText:     { fontSize:12, color:'#333', lineHeight:18, marginBottom:9, fontStyle:'italic' },
  pickBox:        { borderWidth:1, borderRadius:10, padding:8, marginBottom:8 },
  pickKicker:     { fontSize:8.5, fontWeight:'800', letterSpacing:0.7, marginBottom:2 },
  pickLabel:      { fontSize:13, fontWeight:'800', color:'#111', marginBottom:2 },
  pickDetail:     { width:'100%', flexShrink:1, flexWrap:'wrap', fontSize:10.5, color:'#555', lineHeight:15 },
  nedenBtn:       { alignSelf:'flex-start', paddingVertical:4 },
  nedenBtnText:   { fontSize:11, color:'#5b2d8e', fontWeight:'600' },
  nedenBox:       { marginTop:8, paddingTop:8, borderTopWidth:0.5, borderTopColor:'#ddd6ff' },
  nedenBullet:    { fontSize:12, color:'#444', lineHeight:19, marginBottom:3 },

});

export default scoutStyles;

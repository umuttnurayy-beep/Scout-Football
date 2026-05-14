import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Image, Linking, Modal, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Standing, getSuperLigMatch, getSuperLigStandings, getSuperLigTeamForm, getMatchStats, getStandings, getTeamForm } from '../services/api';
import { SavedPick, clearPickHistory, loadPickHistory, pickAccuracy, resolvePickResults } from '../utils/pickHistory';
import { isStanding } from '../services/apiNormalizers';
import EmptyStateCard from '../components/EmptyStateCard';
import {
  DEFAULT_PREFS, NotifPrefs, cancelAllNotifications,
  loadNotifPrefs, registerPushToken, requestPermissions, saveNotifPrefs,
} from '../services/notifications';
import BottomTabBar from '../components/BottomTabBar';
import { useTheme } from '../context/ThemeContext';
import { FavTeam, RecentItem, parseFavTeam, parseFavTeamList, parseRecentItems } from '../utils/profileStorage';
import { cardShadow } from '../utils/scoutStyles';
import { tapLight, tapMedium } from '../services/haptics';
import { parseForm, transliterate } from '../utils/teamStats';
import { isArrayOf, readTimedCache, writeTimedCache } from '../utils/timedCache';

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamSummaryStats = {
  played: number; win: number; draw: number; loss: number;
  gf: number; ga: number; pts: number; pos: number;
};
type TeamStatsRouteTeam = { name: string; teamId: number; leagueName: string; leagueFlag: string; apiId: number };
type PickerTeam = { name: string; teamId: number };
type TeamStatsRouteParams = { teamName: string; teamId: number; leagueName: string; leagueFlag: string; apiId: number; fdId: number } & TeamSummaryStats;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_TEAM_STATS: TeamSummaryStats = { played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, pts: 0, pos: 0 };

function buildTeamStatsParams(team: TeamStatsRouteTeam, stats?: TeamSummaryStats): TeamStatsRouteParams {
  const s = stats ?? EMPTY_TEAM_STATS;
  return { teamName: team.name, teamId: team.teamId, leagueName: team.leagueName, leagueFlag: team.leagueFlag, apiId: team.apiId, fdId: 0, pos: s.pos, played: s.played, win: s.win, draw: s.draw, loss: s.loss, gf: s.gf, ga: s.ga, pts: s.pts };
}

function standingsToPickerTeams(rows: Standing[]): PickerTeam[] {
  return rows.filter(r => r.team).map(r => ({ name: r.team, teamId: r.teamId || 0 })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

function computeSimpleRating(played: number, win: number, gf: number, ga: number): number {
  if (played === 0) return 5;
  const wScore = Math.min((win / played) * 10, 10);
  const aScore = Math.min(gf / played / 0.25, 10);
  const dScore = Math.max(0, 10 - ga / played / 0.25);
  return Math.max(1, Math.min(10, wScore * 0.4 + aScore * 0.3 + dScore * 0.3));
}

function watchlistFormTag(form: string[], isDark: boolean): { label: string; color: string; bg: string } {
  if (form.length === 0) return { label: '—', color: '#888', bg: isDark ? '#1E1E1E' : '#F5F5F5' };
  const ratio = form.filter(r => r === 'G').length / form.length;
  if (ratio >= 0.6) return { label: 'İstikrarlı', color: isDark ? '#3FB950' : '#1B5E20', bg: isDark ? '#0D2010' : '#E8F5E9' };
  if (ratio <= 0.2) return { label: 'Değişken', color: isDark ? '#F85149' : '#A32D2D', bg: isDark ? '#2C0A0A' : '#FDECEA' };
  return { label: 'Dengeli', color: isDark ? '#79AAFF' : '#0C447C', bg: isDark ? '#0A1929' : '#E6F1FB' };
}

function teamAbbrev(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return words.map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
}

const INSIGHT_LEAGUE_MAP: Record<string, string> = {
  '39': 'Premier League', '140': 'La Liga', '78': 'Bundesliga',
  '135': 'Serie A', '61': 'Ligue 1', '2': 'UCL', '203': 'Süper Lig',
};

// ─── Mini Donut ───────────────────────────────────────────────────────────────

function MiniDonut({ pct, color, trackColor, size = 64, stroke = 8 }: { pct: number; color: string; trackColor: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(100, pct)) / 100 * circ;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round" rotation={-90} originX={size / 2} originY={size / 2}
      />
    </Svg>
  );
}

// ─── AnimatedBar ──────────────────────────────────────────────────────────────

function AnimatedBar({ pct, color, style }: { pct: number; color: string; style?: object }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.min(100, pct), duration: 600, useNativeDriver: false }).start();
  }, [pct, anim]);
  const width = anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return <Animated.View style={[style, { width, backgroundColor: color }]} />;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE = { NAME: 'scout_name', AVATAR: 'scout_avatar', FAV_TEAM: 'scout_fav_team', WATCHLIST: 'scout_watchlist', RECENT: 'scout_recent' };
const TEAM_PICKER_TTL = 60 * 60 * 1000;
function teamPickerCacheKey(apiId: number) { return `profile_team_picker_standings_v1_${apiId}`; }

const AVATAR_COLORS = ['#185FA5', '#A32D2D', '#27500A', '#E6A817', '#6B1414', '#1A1A1A', '#7C3AED', '#0E7490'];

const LEAGUES_TEAMS: { leagueName: string; apiId: number; flag: string; teams: { name: string; teamId: number }[] }[] = [
  { leagueName: 'Süper Lig', apiId: 203, flag: '🇹🇷', teams: [
    { name: 'Galatasaray', teamId: 133804 }, { name: 'Fenerbahçe', teamId: 133807 },
    { name: 'Beşiktaş', teamId: 133794 }, { name: 'Trabzonspor', teamId: 133796 },
    { name: 'Başakşehir', teamId: 134589 }, { name: 'Samsunspor', teamId: 133797 },
    { name: 'Göztepe', teamId: 135891 }, { name: 'Çaykur Rizespor', teamId: 133885 },
    { name: 'Konyaspor', teamId: 133835 }, { name: 'Gaziantep FK', teamId: 138092 },
    { name: 'Kocaelispor', teamId: 133870 }, { name: 'Alanyaspor', teamId: 135676 },
    { name: 'Antalyaspor', teamId: 133799 }, { name: 'Gençlerbirliği', teamId: 133798 },
    { name: 'Eyüpspor', teamId: 138977 }, { name: 'Kayserispor', teamId: 133802 },
    { name: 'Fatih Karagümrük', teamId: 138983 }, { name: 'Kasımpaşa', teamId: 133834 },
  ]},
  { leagueName: 'Premier Lig', apiId: 39, flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', teams: [
    { name: 'Arsenal', teamId: 57 }, { name: 'Aston Villa', teamId: 58 },
    { name: 'Chelsea', teamId: 61 }, { name: 'Everton', teamId: 62 },
    { name: 'Liverpool', teamId: 64 }, { name: 'Manchester City', teamId: 65 },
    { name: 'Manchester United', teamId: 66 }, { name: 'Newcastle', teamId: 67 },
    { name: 'Tottenham', teamId: 73 }, { name: 'West Ham', teamId: 563 },
  ]},
  { leagueName: 'La Liga', apiId: 140, flag: '🇪🇸', teams: [
    { name: 'Real Madrid', teamId: 86 }, { name: 'Barcelona', teamId: 81 },
    { name: 'Atlético Madrid', teamId: 78 }, { name: 'Sevilla', teamId: 559 },
    { name: 'Valencia', teamId: 558 }, { name: 'Villarreal', teamId: 514 },
  ]},
  { leagueName: 'Bundesliga', apiId: 78, flag: '🇩🇪', teams: [
    { name: 'Bayern Münih', teamId: 5 }, { name: 'Borussia Dortmund', teamId: 4 },
    { name: 'Bayer Leverkusen', teamId: 3 }, { name: 'RB Leipzig', teamId: 721 },
    { name: 'Eintracht Frankfurt', teamId: 9 },
  ]},
  { leagueName: 'Serie A', apiId: 135, flag: '🇮🇹', teams: [
    { name: 'AC Milan', teamId: 103 }, { name: 'Inter Milan', teamId: 108 },
    { name: 'Juventus', teamId: 109 }, { name: 'Napoli', teamId: 113 },
    { name: 'Roma', teamId: 100 }, { name: 'Atalanta', teamId: 102 },
    { name: 'Fiorentina', teamId: 99 }, { name: 'Lazio', teamId: 110 },
  ]},
  { leagueName: 'Ligue 1', apiId: 61, flag: '🇫🇷', teams: [
    { name: 'Paris Saint-Germain', teamId: 524 }, { name: 'Monaco', teamId: 548 },
    { name: 'Olympique Marseille', teamId: 516 }, { name: 'Lyon', teamId: 523 }, { name: 'Lille', teamId: 521 },
  ]},
];

const TEAM_COLORS: Record<string, { p: string; s: string }> = {
  'Galatasaray': { p: '#C8102E', s: '#F5A623' }, 'Fenerbahçe': { p: '#1B3D7F', s: '#FFD700' },
  'Beşiktaş': { p: '#1A1A1A', s: '#CCCCCC' }, 'Trabzonspor': { p: '#6B1414', s: '#1A3F6F' },
  'Başakşehir': { p: '#FF6B00', s: '#0C2D6B' }, 'Samsunspor': { p: '#E30613', s: '#1B5AA8' },
  'Göztepe': { p: '#FF7A00', s: '#FFC200' }, 'Eyüpspor': { p: '#0C4B7F', s: '#C8A000' },
  'Konyaspor': { p: '#005B30', s: '#FFFFFF' }, 'Kayserispor': { p: '#D4000E', s: '#FFCD00' },
  'Antalyaspor': { p: '#C0392B', s: '#FFFFFF' }, 'Alanyaspor': { p: '#E05206', s: '#1A3F6F' },
  'Gaziantep FK': { p: '#D4000E', s: '#1A1A1A' }, 'Kocaelispor': { p: '#00529F', s: '#E30613' },
  'Çaykur Rizespor': { p: '#003087', s: '#E30613' }, 'Gençlerbirliği': { p: '#E30613', s: '#1A1A1A' },
  'Fatih Karagümrük': { p: '#C8102E', s: '#1A1A1A' },
  'Arsenal': { p: '#EF0107', s: '#FFFFFF' }, 'Chelsea': { p: '#034694', s: '#FFFFFF' },
  'Liverpool': { p: '#C8102E', s: '#F6EB61' }, 'Manchester City': { p: '#6CABDD', s: '#1C2C5B' },
  'Manchester United': { p: '#DA291C', s: '#FFE500' }, 'Tottenham': { p: '#132257', s: '#FFFFFF' },
  'Newcastle': { p: '#241F20', s: '#FFFFFF' }, 'Aston Villa': { p: '#670E36', s: '#CEFFDB' },
  'Real Madrid': { p: '#FEBE10', s: '#00529F' }, 'Barcelona': { p: '#A50044', s: '#004D98' },
  'Atlético Madrid': { p: '#CE3524', s: '#FFFFFF' }, 'Bayern Münih': { p: '#DC052D', s: '#0066B2' },
  'Borussia Dortmund': { p: '#FFE01A', s: '#1A1A1A' }, 'Bayer Leverkusen': { p: '#E32221', s: '#000000' },
  'RB Leipzig': { p: '#DD0741', s: '#001D62' }, 'AC Milan': { p: '#FB090B', s: '#1A1A1A' },
  'Inter Milan': { p: '#010E80', s: '#1A1A1A' }, 'Juventus': { p: '#1A1A1A', s: '#FFFFFF' },
  'Napoli': { p: '#12A0C2', s: '#FFFFFF' }, 'Roma': { p: '#A52A2A', s: '#F5C518' },
  'Atalanta': { p: '#1A4797', s: '#000000' }, 'Paris Saint-Germain': { p: '#004170', s: '#DA291C' },
  'Monaco': { p: '#E4000E', s: '#FFFFFF' }, 'Olympique Marseille': { p: '#26C5E8', s: '#FFFFFF' },
};

function getTeamColors(name: string): { p: string; s: string } {
  for (const key of Object.keys(TEAM_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(name.toLowerCase())) return TEAM_COLORS[key];
  }
  return { p: '#185FA5', s: '#0C447C' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { colors: c, mode, setMode, isDark } = useTheme();

  const [scoutName, setScoutName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [avatarIdx, setAvatarIdx] = useState(0);
  const [favTeam, setFavTeam] = useState<FavTeam | null>(null);
  const [watchlist, setWatchlist] = useState<FavTeam[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentItem[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({ ...DEFAULT_PREFS });

  const [favForm, setFavForm] = useState<string[]>([]);
  const [favPos, setFavPos] = useState(0);
  const [favPts, setFavPts] = useState(0);
  const [leaderPts, setLeaderPts] = useState(0);
  const [favPlayed, setFavPlayed] = useState(0);
  const [favWin, setFavWin] = useState(0);
  const [favDraw, setFavDraw] = useState(0);
  const [favLoss, setFavLoss] = useState(0);
  const [favGf, setFavGf] = useState(0);
  const [favGa, setFavGa] = useState(0);
  const [loadingFav, setLoadingFav] = useState(false);
  const [favLoadError, setFavLoadError] = useState(false);

  const [watchlistForms, setWatchlistForms] = useState<Record<number, string[]>>({});
  const [watchlistStats, setWatchlistStats] = useState<Record<string, TeamSummaryStats>>({});
  const [recentStats, setRecentStats] = useState<Record<string, TeamSummaryStats>>({});
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [teamPickerVisible, setTeamPickerVisible] = useState(false);
  const [teamPickerMode, setTeamPickerMode] = useState<'fav' | 'watchlist'>('fav');
  const [teamSearch, setTeamSearch] = useState('');
  const [pickerTeamsByLeague, setPickerTeamsByLeague] = useState<Record<number, PickerTeam[]>>({});
  const [loadingTeamPicker, setLoadingTeamPicker] = useState(false);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [picks, setPicks] = useState<SavedPick[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const history = await loadPickHistory();
        if (!cancelled) setPicks(history);
        await resolvePickResults(async (pick) => {
          try {
            if (pick.isSuperLig) {
              const event = await getSuperLigMatch(pick.id);
              if (!event) return null;
              const finished = ['FT', 'AET', 'PEN', 'Match Finished'].includes(event.strStatus || '');
              if (!finished) return null;
              const h = Number(event.intHomeScore); const a = Number(event.intAwayScore);
              return Number.isFinite(h) && Number.isFinite(a) ? { home: h, away: a } : null;
            } else {
              const data = await getMatchStats(pick.id);
              if (!data || data.status !== 'FINISHED') return null;
              const h = data.score?.fullTime?.home; const a = data.score?.fullTime?.away;
              return typeof h === 'number' && typeof a === 'number' ? { home: h, away: a } : null;
            }
          } catch { return null; }
        });
        const updated = await loadPickHistory();
        if (!cancelled) setPicks(updated);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      loadAll();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  async function loadAll() {
    const [name, avt, favRaw, wlRaw, recentRaw, prefs] = await Promise.all([
      AsyncStorage.getItem(STORAGE.NAME), AsyncStorage.getItem(STORAGE.AVATAR),
      AsyncStorage.getItem(STORAGE.FAV_TEAM), AsyncStorage.getItem(STORAGE.WATCHLIST),
      AsyncStorage.getItem(STORAGE.RECENT), loadNotifPrefs(),
    ]);
    const fav_ = parseFavTeam(favRaw); const wl_ = parseFavTeamList(wlRaw); const recent_ = parseRecentItems(recentRaw);
    setScoutName(name || ''); setAvatarIdx(avt ? parseInt(avt) : 0);
    setFavTeam(fav_); setWatchlist(wl_); setRecentlyViewed(recent_); setNotifPrefs(prefs);
    if (fav_) loadFavTeamData(fav_);
    if (wl_.length > 0) loadWatchlistForms(wl_);
    if (recent_.length > 0) loadRecentStats(recent_);
  }

  async function loadFavTeamData(team: FavTeam) {
    setLoadingFav(true); setFavLoadError(false);
    try {
      const [matches, standings] = await Promise.all([
        team.apiId === 203 ? getSuperLigTeamForm(team.teamId) : getTeamForm(team.teamId),
        team.apiId === 203 ? getSuperLigStandings() : getStandings(team.apiId),
      ]);
      if (standings.length > 0) {
        const lPts = standings[0].pts;
        const found = standings.find(s => transliterate(s.team).includes(transliterate(team.name)) || transliterate(team.name).includes(transliterate(s.team)));
        if (found) {
          setFavPos(found.pos); setFavPts(found.pts); setLeaderPts(lPts);
          setFavPlayed(found.played ?? 0); setFavWin(found.win ?? 0); setFavDraw(found.draw ?? 0);
          setFavLoss(found.loss ?? 0); setFavGf(found.gf ?? 0); setFavGa(found.ga ?? 0);
        }
      }
      setFavForm(parseForm(matches, team.teamId, team.apiId === 203).slice(-5));
    } catch { setFavLoadError(true); }
    setLoadingFav(false);
  }

  async function loadWatchlistForms(wl: FavTeam[]) {
    setLoadingWatchlist(true);
    const forms: Record<number, string[]> = {};
    const stats: Record<string, TeamSummaryStats> = {};
    const uniqueApiIds = [...new Set(wl.map(t => t.apiId))];
    const standingsMap: Record<number, Standing[]> = {};
    await Promise.all(uniqueApiIds.map(async (apiId) => {
      try { standingsMap[apiId] = apiId === 203 ? await getSuperLigStandings() : await getStandings(apiId); }
      catch { standingsMap[apiId] = []; }
    }));
    await Promise.all(wl.slice(0, 5).map(async (team) => {
      try {
        const matches = team.apiId === 203 ? await getSuperLigTeamForm(team.teamId) : await getTeamForm(team.teamId);
        forms[team.teamId || -Math.random()] = parseForm(matches, team.teamId, team.apiId === 203).slice(-3);
      } catch {}
      const rows = standingsMap[team.apiId] || [];
      const found = rows.find(s => transliterate(s.team || '').includes(transliterate(team.name)) || transliterate(team.name).includes(transliterate(s.team || '')));
      if (found) stats[team.name] = { played: found.played ?? 0, win: found.win ?? 0, draw: found.draw ?? 0, loss: found.loss ?? 0, gf: found.gf ?? 0, ga: found.ga ?? 0, pts: found.pts ?? 0, pos: found.pos ?? 0 };
    }));
    setWatchlistForms(forms); setWatchlistStats(stats); setLoadingWatchlist(false);
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    setScoutName(trimmed); setEditingName(false);
    await AsyncStorage.setItem(STORAGE.NAME, trimmed);
  }

  async function loadRecentStats(items: RecentItem[]) {
    const uniqueApiIds = [...new Set(items.map(r => r.apiId))];
    const standingsMap: Record<number, Standing[]> = {};
    await Promise.all(uniqueApiIds.map(async (apiId) => {
      try { standingsMap[apiId] = apiId === 203 ? await getSuperLigStandings() : await getStandings(apiId); }
      catch { standingsMap[apiId] = []; }
    }));
    const stats: Record<string, TeamSummaryStats> = {};
    for (const item of items) {
      const found = (standingsMap[item.apiId] || []).find(s => transliterate(s.team || '').includes(transliterate(item.name)) || transliterate(item.name).includes(transliterate(s.team || '')));
      if (found) stats[item.name] = { played: found.played ?? 0, win: found.win ?? 0, draw: found.draw ?? 0, loss: found.loss ?? 0, gf: found.gf ?? 0, ga: found.ga ?? 0, pts: found.pts ?? 0, pos: found.pos ?? 0 };
    }
    setRecentStats(stats);
  }

  async function selectTeam(leagueFlag: string, leagueName: string, apiId: number, teamName: string, teamId: number) {
    tapMedium();
    const team: FavTeam = { name: teamName, teamId, apiId, leagueName, leagueFlag };
    setTeamPickerVisible(false); setTeamSearch('');
    if (teamPickerMode === 'fav') {
      setFavTeam(team); setFavForm([]); setFavPos(0);
      await AsyncStorage.setItem(STORAGE.FAV_TEAM, JSON.stringify(team));
      loadFavTeamData(team);
    } else {
      const existing = await AsyncStorage.getItem(STORAGE.WATCHLIST);
      const wl = parseFavTeamList(existing);
      if (!wl.find(t => t.name === teamName && t.apiId === apiId)) {
        const updated = [...wl, team];
        setWatchlist(updated);
        await AsyncStorage.setItem(STORAGE.WATCHLIST, JSON.stringify(updated));
        loadWatchlistForms(updated);
      }
    }
  }

  async function loadTeamPickerTeams(force = false) {
    setLoadingTeamPicker(true);
    const next: Record<number, PickerTeam[]> = {};
    await Promise.all(LEAGUES_TEAMS.map(async (league) => {
      const cacheKey = teamPickerCacheKey(league.apiId);
      const cached = force ? null : await readTimedCache(cacheKey, TEAM_PICKER_TTL, isArrayOf(isStanding));
      if (cached && cached.length > 0) next[league.apiId] = standingsToPickerTeams(cached);
      try {
        const standings = league.apiId === 203 ? await getSuperLigStandings() : await getStandings(league.apiId, { silent: Boolean(cached?.length) });
        if (standings.length > 0) { next[league.apiId] = standingsToPickerTeams(standings); writeTimedCache(cacheKey, standings); }
      } catch {}
    }));
    setPickerTeamsByLeague(next); setLoadingTeamPicker(false);
  }

  function openTeamPicker(mode: 'fav' | 'watchlist') {
    setTeamPickerMode(mode); setTeamPickerVisible(true); void loadTeamPickerTeams();
  }

  async function removeFavTeam() { setFavTeam(null); setFavForm([]); setFavPos(0); await AsyncStorage.removeItem(STORAGE.FAV_TEAM); }

  async function removeWatchlistItem(teamName: string) {
    tapLight();
    const updated = watchlist.filter(t => t.name !== teamName);
    setWatchlist(updated); await AsyncStorage.setItem(STORAGE.WATCHLIST, JSON.stringify(updated));
  }

  async function togglePref(key: keyof NotifPrefs, val: boolean) {
    const updated = { ...notifPrefs, [key]: val };
    const anyEnabled = updated.daily || updated.favTeam || updated.featured;
    if (val && anyEnabled) {
      const granted = await requestPermissions();
      if (!granted) { Alert.alert('Bildirim izni gerekli', 'Lütfen uygulama ayarlarından bildirim iznini etkinleştirin.'); return; }
    }
    if (!anyEnabled) await cancelAllNotifications();
    setNotifPrefs(updated); await saveNotifPrefs(updated);
    if (anyEnabled) await registerPushToken(updated, watchedTeamNames);
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        favTeam ? loadFavTeamData(favTeam) : Promise.resolve(),
        watchlist.length > 0 ? loadWatchlistForms(watchlist) : Promise.resolve(),
        recentlyViewed.length > 0 ? loadRecentStats(recentlyViewed) : Promise.resolve(),
      ]);
    } finally { setRefreshing(false); }
  }

  function goToTeamStats(team: FavTeam) {
    tapMedium();
    router.push({ pathname: '/team_stats', params: buildTeamStatsParams(team, favSummaryStats) });
  }

  // ─── Derived values ──────────────────────────────────────────────────────────

  const avatarColor = useMemo(() => AVATAR_COLORS[avatarIdx] || '#185FA5', [avatarIdx]);
  const avatarLabel = useMemo(() => scoutName ? scoutName.trim().slice(0, 2).toUpperCase() : '?', [scoutName]);
  const favColors = useMemo(() => favTeam ? getTeamColors(favTeam.name) : { p: '#185FA5', s: '#0C447C' }, [favTeam]);

  const favSummaryStats = useMemo<TeamSummaryStats>(() => ({
    played: favPlayed, win: favWin, draw: favDraw, loss: favLoss,
    gf: favGf, ga: favGa, pts: favPts, pos: favPos,
  }), [favDraw, favGa, favGf, favLoss, favPlayed, favPos, favPts, favWin]);

  const watchedTeamNames = useMemo(() => [favTeam?.name, ...watchlist.map(t => t.name)].filter(Boolean) as string[], [favTeam, watchlist]);

  const watchlistRows = useMemo(() => watchlist.map(team => ({
    team, colors: getTeamColors(team.name),
    form: watchlistForms[team.teamId] || [],
    stats: watchlistStats[team.name],
  })), [watchlist, watchlistForms, watchlistStats]);

  const recentRows = useMemo(() => recentlyViewed.slice(0, 8).map((item, index) => ({
    item, index, stats: recentStats[item.name],
  })), [recentlyViewed, recentStats]);

  // XP & tier
  const xp = useMemo(() => recentlyViewed.length * 50 + watchlist.length * 100 + picks.length * 75, [recentlyViewed, watchlist, picks]);
  const level = Math.min(50, Math.floor(xp / 250) + 1);
  const xpInLevel = xp % 250;
  const tier = useMemo(() => {
    if (level >= 12) return { title: 'Elite Scout', icon: '⭐', topPct: 'Top 7%' };
    if (level >= 8)  return { title: 'Scout',        icon: '🏆', topPct: 'Top 15%' };
    if (level >= 4)  return { title: 'Analist',      icon: '🔍', topPct: 'Top 30%' };
    return                   { title: 'Başlangıç',   icon: '📊', topPct: 'Top 50%' };
  }, [level]);

  // Most-viewed league for identity card
  const topLeagueName = useMemo(() => {
    if (recentlyViewed.length === 0) return '';
    const counts: Record<string, number> = {};
    recentlyViewed.forEach(r => { const k = String(r.apiId); counts[k] = (counts[k] || 0) + 1; });
    const topKey = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return topKey ? (INSIGHT_LEAGUE_MAP[topKey] || '') : '';
  }, [recentlyViewed]);

  // Scout Insight
  const scoutInsight = useMemo(() => {
    if (recentlyViewed.length < 3) return null;
    const rated = recentlyViewed.filter(r => { const s = recentStats[r.name]; return s && s.played > 0; });
    const highRated = rated.filter(r => { const s = recentStats[r.name]; return computeSimpleRating(s.played, s.win, s.gf, s.ga) >= 7; });
    const pct = rated.length > 0 ? Math.round((highRated.length / rated.length) * 100) : 50;
    let text = '';
    if (topLeagueName) text += `${topLeagueName} odaklı analizler yapıyorsun. `;
    if (pct >= 60)      text += `Yüksek Scout Rating'li takımları inceleme oranın %${pct}.`;
    else if (pct >= 35) text += 'Dengeli bir takım profili tercih ediyorsun.';
    else                text += 'Geniş bir takım yelpazesi inceliyorsun.';
    const label = pct >= 60 ? 'Ofansif odaklı analizler' : pct >= 35 ? 'Dengeli analiz profili' : 'Geniş yelpazeye odaklanma';
    return { text: text.trim(), pct, label };
  }, [recentlyViewed, recentStats, topLeagueName]);

  // Filtered leagues for picker
  const filteredLeagues = useMemo(() =>
    LEAGUES_TEAMS.map(lg => ({
      ...lg,
      teams: (pickerTeamsByLeague[lg.apiId]?.length ? pickerTeamsByLeague[lg.apiId] : lg.teams).filter(t =>
        !teamSearch || transliterate(t.name).toLowerCase().includes(transliterate(teamSearch).toLowerCase())
      ),
    })).filter(lg => lg.teams.length > 0),
  [pickerTeamsByLeague, teamSearch]);

  // ─── Modals ──────────────────────────────────────────────────────────────────

  function renderTeamPicker() {
    return (
      <Modal visible={teamPickerVisible} animationType="slide" transparent onRequestClose={() => { setTeamPickerVisible(false); setTeamSearch(''); }}>
        <View style={styles.bsOverlay}>
          <TouchableOpacity style={styles.bsDismissArea} activeOpacity={1} onPress={() => { setTeamPickerVisible(false); setTeamSearch(''); }} />
          <View style={[styles.bsContainer, { backgroundColor: c.surface }]}>
            <View style={[styles.bsHandle, { backgroundColor: c.border }]} />
            <View style={[styles.bsHeader, { borderBottomColor: c.border }]}>
              <Text style={[styles.bsTitle, { color: c.text }]}>{teamPickerMode === 'fav' ? 'Favori Takım Seç' : 'Takip Listesine Ekle'}</Text>
              <TouchableOpacity onPress={() => { setTeamPickerVisible(false); setTeamSearch(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={c.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={[styles.bsSearch, { borderBottomColor: c.borderLight }]}>
              <TextInput style={[styles.pickerSearchInput, { backgroundColor: c.surfaceAlt, color: c.text }]} placeholder="Takım ara..." placeholderTextColor={c.textMuted} value={teamSearch} onChangeText={setTeamSearch} autoCorrect={false} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {loadingTeamPicker && Object.keys(pickerTeamsByLeague).length === 0 && <Text style={[styles.pickerLoadingText, { color: c.textMuted }]}>Takımlar yükleniyor...</Text>}
              {filteredLeagues.map(lg => (
                <View key={lg.leagueName}>
                  <View style={[styles.pickerLeagueHeader, { backgroundColor: c.surfaceAlt, borderBottomColor: c.border }]}>
                    <Text style={[styles.pickerLeagueTitle, { color: c.textMuted }]}>{lg.flag} {lg.leagueName}</Text>
                  </View>
                  {lg.teams.map(t => (
                    <TouchableOpacity key={t.name} style={[styles.pickerTeamRow, { borderBottomColor: c.borderLight }]}
                      onPress={() => selectTeam(lg.flag, lg.leagueName, lg.apiId, t.name, t.teamId)}>
                      <View style={[styles.pickerTeamDot, { backgroundColor: getTeamColors(t.name).p }]} />
                      <Text style={[styles.pickerTeamName, { color: c.text }]}>{t.name}</Text>
                      <Ionicons name="chevron-forward" size={16} color={c.textVeryFaint} />
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
              <View style={styles.pickerBottomSpacer} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  function renderAvatarPicker() {
    return (
      <Modal visible={avatarPickerVisible} animationType="fade" transparent onRequestClose={() => setAvatarPickerVisible(false)}>
        <View style={styles.avatarModalOverlay}>
          <View style={[styles.avatarModalBox, { backgroundColor: c.surface }]}>
            <Text style={[styles.avatarModalTitle, { color: c.text }]}>Renk Seç</Text>
            <View style={styles.avatarGrid}>
              {AVATAR_COLORS.map((color, i) => (
                <TouchableOpacity key={i} style={[styles.avatarOption, { backgroundColor: color }, i === avatarIdx && styles.avatarOptionSelected]}
                  onPress={async () => { setAvatarIdx(i); await AsyncStorage.setItem(STORAGE.AVATAR, String(i)); setAvatarPickerVisible(false); }}>
                  {i === avatarIdx && <Text style={styles.avatarCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.avatarModalCancel} onPress={() => setAvatarPickerVisible(false)}>
              <Text style={[styles.avatarModalCancelText, { color: c.textMuted }]}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {renderTeamPicker()}
      {renderAvatarPicker()}

      <View style={[styles.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.headerBrand}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        </View>
        <Text style={[styles.topbarTitle, { color: c.text }]}>Scout Rozeti</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}>

        {/* ── Scout Kimlik Kartı ────────────────────────────────────────────── */}
        <View style={[styles.identityCard, { backgroundColor: c.surface }, cardShadow(isDark)]}>
          {/* Avatar with ring */}
          <TouchableOpacity style={styles.avatarWrap} onPress={() => setAvatarPickerVisible(true)}>
            <View style={[styles.avatarRing, { borderColor: c.primary }]}>
              <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarText}>{avatarLabel}</Text>
              </View>
            </View>
            <View style={[styles.avatarEditDot, { backgroundColor: c.primary }]}>
              <Ionicons name="pencil" size={9} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Info */}
          <View style={styles.identityInfo}>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput style={[styles.nameInput, { color: c.text, borderBottomColor: c.primary }]} value={nameInput} onChangeText={setNameInput} placeholder="Scout adın..." placeholderTextColor={c.textMuted} autoFocus onSubmitEditing={saveName} />
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.primary }]} onPress={saveName}>
                  <Text style={styles.saveBtnText}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { setNameInput(scoutName); setEditingName(true); }}>
                <Text style={[styles.scoutName, { color: c.text }]}>{scoutName || 'Adın ne olsun?'}</Text>
              </TouchableOpacity>
            )}
            <View style={styles.analystBadge}>
              <Ionicons name="shield-checkmark" size={11} color={c.primary} />
              <Text style={[styles.analystText, { color: c.primary }]}>Scout Analyst</Text>
            </View>
            {topLeagueName ? (
              <Text style={[styles.leagueFocusText, { color: c.textMuted }]} numberOfLines={1}>{topLeagueName} odaklı · Tempo: Yüksek</Text>
            ) : null}
            <View style={styles.xpRow}>
              <Text style={styles.xpStar}>★</Text>
              <Text style={[styles.xpLevelText, { color: c.text }]}>Seviye {level}</Text>
              <View style={[styles.xpTrack, { backgroundColor: c.border }]}>
                <AnimatedBar pct={(xpInLevel / 250) * 100} color={c.primary} style={styles.xpFill} />
              </View>
              <Text style={[styles.xpCounter, { color: c.textFaint }]}>{xp} XP</Text>
            </View>
          </View>

          {/* Tier badge */}
          <View style={[styles.tierBadge, { backgroundColor: isDark ? '#0A1929' : '#E6F1FB' }]}>
            <Text style={styles.tierBadgeIcon}>{tier.icon}</Text>
            <Text style={[styles.tierBadgeTitle, { color: c.primary }]}>{tier.title}</Text>
            <Text style={[styles.tierBadgeTop, { color: c.textMuted }]}>{tier.topPct}</Text>
          </View>
        </View>

        {/* ── Favori Takım ─────────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>FAVORİ TAKIM</Text>
          {favTeam ? (
            <TouchableOpacity onPress={removeFavTeam}><Text style={[styles.sectionAction, { color: c.primary }]}>Kaldır</Text></TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => openTeamPicker('fav')}><Text style={[styles.sectionAction, { color: c.primary }]}>Düzenle</Text></TouchableOpacity>
          )}
        </View>

        {favTeam ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => goToTeamStats(favTeam)}>
            <View style={[styles.favCard, { backgroundColor: favColors.p }]}>
              <View style={[styles.favCardStripe, { backgroundColor: favColors.s }]} />
              <View style={styles.favCardContent}>
                <View style={styles.favCardTop}>
                  <View style={[styles.favTeamBadge, { backgroundColor: favColors.s }]}>
                    <Text style={[styles.favTeamBadgeText, { color: favColors.p }]}>{teamAbbrev(favTeam.name)}</Text>
                  </View>
                  <View style={styles.favTeamInfo}>
                    <Text style={styles.favTeamName}>{favTeam.name}</Text>
                    <Text style={styles.favLeagueName}>{favTeam.leagueFlag} {favTeam.leagueName}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
                </View>
                {loadingFav ? (
                  <View style={styles.favSkeletonRow}>
                    {[0, 1, 2].map(i => <View key={i} style={styles.favSkeletonItem}><View style={styles.favSkeletonVal} /><View style={styles.favSkeletonLbl} /></View>)}
                  </View>
                ) : favLoadError ? (
                  <View style={styles.favErrorWrap}>
                    <EmptyStateCard compact icon="wifi-outline" title="Takım verisi alınamadı" onRetry={() => favTeam && loadFavTeamData(favTeam)} retryLabel="Tekrar Dene" />
                  </View>
                ) : (
                  <View style={styles.favStatsRow}>
                    <View style={styles.favStatItem}>
                      <Text style={styles.favStatValue}>{favPos > 0 ? `${favPos}. Sıra` : '—'}</Text>
                      <Text style={styles.favStatLabel}>Puan Durumu</Text>
                    </View>
                    <View style={styles.favStatDivider} />
                    <View style={styles.favStatItem}>
                      <Text style={styles.favStatValue}>{favPos > 0 && leaderPts > 0 ? (favPos === 1 ? 'Lider' : `-${leaderPts - favPts} P`) : '—'}</Text>
                      <Text style={styles.favStatLabel}>Liderden Fark</Text>
                    </View>
                    <View style={styles.favStatDivider} />
                    <View style={styles.favStatItem}>
                      <View style={styles.formDots}>
                        {favForm.length > 0
                          ? favForm.map((r, i) => <View key={i} style={[styles.formDot, r === 'G' ? { backgroundColor: '#3FB950' } : r === 'B' ? { backgroundColor: '#888' } : { backgroundColor: '#F85149' }]} />)
                          : <Text style={styles.favStatValue}>—</Text>}
                      </View>
                      <Text style={styles.favStatLabel}>Son 5 Maç</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.addTeamBtn, { borderColor: c.primary }]} onPress={() => openTeamPicker('fav')}>
            <Text style={[styles.addTeamBtnIcon, { color: c.primary }]}>+</Text>
            <Text style={[styles.addTeamBtnText, { color: c.primary }]}>Favori takımını seç</Text>
          </TouchableOpacity>
        )}

        {/* ── Takip Listesi — Yatay Scroll Kartlar ────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>TAKİP LİSTESİ</Text>
          <TouchableOpacity onPress={() => openTeamPicker('watchlist')}>
            <Text style={[styles.sectionAction, { color: c.primary }]}>+ Ekle</Text>
          </TouchableOpacity>
        </View>

        {watchlist.length === 0 ? (
          <Text style={[styles.emptyHint, { color: c.textFaint }]}>İzlemek istediğin takımları buraya ekle.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wlScroll}>
            {watchlistRows.map(({ team, colors, form }) => {
              const tag = watchlistFormTag(form, isDark);
              const abbr = teamAbbrev(team.name);
              const stats = watchlistStats[team.name];
              return (
                <TouchableOpacity key={team.name} style={[styles.wlCard, { backgroundColor: c.surface }]}
                  activeOpacity={0.75}
                  onPress={() => router.push({ pathname: '/team_stats', params: buildTeamStatsParams(team, stats) })}>
                  {/* Remove button */}
                  <TouchableOpacity style={styles.wlCloseBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    onPress={() => removeWatchlistItem(team.name)}>
                    <Ionicons name="close" size={13} color={c.textMuted} />
                  </TouchableOpacity>
                  {/* Team badge */}
                  <View style={[styles.wlBadge, { backgroundColor: colors.p }]}>
                    <Text style={styles.wlBadgeText}>{abbr}</Text>
                  </View>
                  <Text style={[styles.wlName, { color: c.text }]} numberOfLines={1}>{team.name}</Text>
                  <Text style={[styles.wlLeague, { color: c.textMuted }]} numberOfLines={1}>{team.leagueName}</Text>
                  {/* Tag pill */}
                  <View style={[styles.wlTagPill, { backgroundColor: tag.bg }]}>
                    <View style={[styles.wlTagDot, { backgroundColor: tag.color }]} />
                    <Text style={[styles.wlTagText, { color: tag.color }]}>{tag.label}</Text>
                  </View>
                  {/* Form dots */}
                  <View style={styles.wlFormRow}>
                    {loadingWatchlist && form.length === 0
                      ? [0,1,2].map(i => <View key={i} style={[styles.wlFormDot, { backgroundColor: c.borderLight }]} />)
                      : form.map((r, i) => <View key={i} style={[styles.wlFormDot, r === 'G' ? { backgroundColor: '#3FB950' } : r === 'B' ? { backgroundColor: '#888' } : { backgroundColor: '#F85149' }]} />)
                    }
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Son Bakılanlar ────────────────────────────────────────────────── */}
        {recentlyViewed.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: c.textMuted }]}>SON BAKILANLAR</Text>
              <TouchableOpacity onPress={async () => { await AsyncStorage.removeItem(STORAGE.RECENT); setRecentlyViewed([]); }}>
                <Text style={[styles.sectionAction, { color: c.primary }]}>Temizle</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.recentCard, { backgroundColor: c.surface }]}>
              {recentRows.map(({ item, index, stats }) => {
                const sr = stats && stats.played > 0 ? computeSimpleRating(stats.played, stats.win, stats.gf, stats.ga) : null;
                const abbr = teamAbbrev(item.name);
                const isLast = index === recentRows.length - 1;
                return (
                  <TouchableOpacity key={`${item.apiId}-${item.id}-${index}`}
                    style={[styles.recentRow, !isLast && { borderBottomWidth: 0.5, borderBottomColor: c.borderLight }]}
                    onPress={() => router.push({ pathname: '/team_stats', params: buildTeamStatsParams({ name: item.name, teamId: item.id, leagueName: item.leagueName, leagueFlag: '', apiId: item.apiId }, stats) })}>
                    <View style={[styles.recentIcon, { backgroundColor: c.primaryLight }]}>
                      <Text style={[styles.recentIconText, { color: c.primaryDark }]}>{abbr}</Text>
                    </View>
                    <View style={styles.recentInfo}>
                      <Text style={[styles.recentName, { color: c.text }]}>{item.name}</Text>
                      <Text style={[styles.recentLeague, { color: c.textMuted }]}>{item.leagueName}</Text>
                    </View>
                    {sr !== null && (
                      <View style={styles.recentSrWrap}>
                        <Ionicons name="trending-up" size={12} color={sr >= 7 ? '#3FB950' : sr >= 5 ? c.primary : '#F85149'} />
                        <Text style={[styles.recentSrVal, { color: sr >= 7 ? '#3FB950' : sr >= 5 ? c.primary : '#F85149' }]}>{sr.toFixed(1)}</Text>
                        <Text style={[styles.recentSrLbl, { color: c.textFaint }]}>Scout Rating</Text>
                      </View>
                    )}
                    <Text style={[styles.recentTime, { color: c.textFaint }]}>{timeAgo(item.timestamp)}</Text>
                    <Ionicons name="chevron-forward" size={14} color={c.textVeryFaint} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── Scout Insight ─────────────────────────────────────────────────── */}
        {scoutInsight && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: c.textMuted }]}>SCOUT INSIGHT</Text>
            </View>
            <View style={[styles.insightCard, { backgroundColor: isDark ? '#0D1629' : '#EEF2FF' }]}>
              <View style={styles.insightLeft}>
                <View style={styles.insightTitleRow}>
                  <Ionicons name="analytics" size={14} color="#7C3AED" />
                  <Text style={[styles.insightTitle, { color: '#7C3AED' }]}>SCOUT INSIGHT</Text>
                </View>
                <Text style={[styles.insightText, { color: isDark ? 'rgba(255,255,255,0.85)' : '#1A1A2E' }]}>
                  {scoutInsight.text}
                </Text>
              </View>
              <View style={styles.insightRight}>
                <View style={styles.insightDonutWrap}>
                  <MiniDonut
                    pct={scoutInsight.pct}
                    color="#7C3AED"
                    trackColor={isDark ? '#1E1A3A' : '#D4C8F5'}
                    size={68}
                    stroke={9}
                  />
                  <View style={styles.insightDonutCenter}>
                    <Text style={[styles.insightDonutPct, { color: isDark ? '#fff' : '#1A1A2E' }]}>{scoutInsight.pct}%</Text>
                  </View>
                </View>
                <Text style={[styles.insightDonutLbl, { color: isDark ? 'rgba(255,255,255,0.6)' : '#5B5B8A' }]} numberOfLines={2}>{scoutInsight.label}</Text>
              </View>
            </View>
          </>
        )}

        {/* ── Scout Performansı ─────────────────────────────────────────────── */}
        {picks.length > 0 && (() => {
          const acc = pickAccuracy(picks);
          const displayPicks = picks.slice(0, 10);
          return (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: c.textMuted }]}>SCOUT PERFORMANSI</Text>
                <TouchableOpacity onPress={async () => { await clearPickHistory(); setPicks([]); }}>
                  <Text style={[styles.sectionAction, { color: c.primary }]}>Temizle</Text>
                </TouchableOpacity>
              </View>
              {acc.total > 0 && (
                <View style={[styles.pickAccCard, { backgroundColor: c.surface }, cardShadow(isDark)]}>
                  <View style={styles.pickAccTop}>
                    <Text style={[styles.pickAccScore, { color: c.text }]}>{acc.correct}<Text style={[styles.pickAccTotal, { color: c.textMuted }]}>/{acc.total}</Text></Text>
                    <Text style={[styles.pickAccLabel, { color: c.textSub }]}>isabetli tahmin</Text>
                    <Text style={[styles.pickAccPct, { color: acc.pct >= 60 ? '#3FB950' : acc.pct >= 40 ? (isDark ? '#E3B341' : '#B7791F') : '#F85149' }]}>%{acc.pct}</Text>
                  </View>
                  <View style={[styles.pickAccBarBg, { backgroundColor: c.borderLight }]}>
                    <AnimatedBar pct={acc.pct} color={acc.pct >= 60 ? '#3FB950' : acc.pct >= 40 ? (isDark ? '#E3B341' : '#B7791F') : '#F85149'} style={styles.pickAccBarFill} />
                  </View>
                </View>
              )}
              {displayPicks.map((pick) => {
                const hasResult = pick.result !== undefined;
                const correct = pick.result?.correct;
                const icon = hasResult ? (correct ? '✓' : '✗') : '⏳';
                const iconColor = hasResult ? (correct ? '#3FB950' : '#F85149') : c.textFaint;
                const dateLabel = pick.date ? new Date(pick.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '';
                const scoreLabel = hasResult ? ` · ${pick.result!.homeScore}-${pick.result!.awayScore}` : '';
                return (
                  <View key={pick.id} style={[styles.pickRow, { backgroundColor: c.surface, borderBottomColor: c.borderLight }]}>
                    <View style={[styles.pickIconWrap, { borderColor: iconColor }]}>
                      <Text style={[styles.pickIcon, { color: iconColor }]}>{icon}</Text>
                    </View>
                    <View style={styles.pickRowContent}>
                      <Text style={[styles.pickTeams, { color: c.text }]} numberOfLines={1}>{pick.homeTeam} – {pick.awayTeam}</Text>
                      <Text style={[styles.pickMeta, { color: c.textFaint }]} numberOfLines={1}>{pick.pickLabel}{scoreLabel} · {dateLabel}</Text>
                    </View>
                  </View>
                );
              })}
              {picks.length > 10 && <Text style={[styles.pickMoreHint, { color: c.textFaint }]}>+{picks.length - 10} daha eski tahmin</Text>}
            </>
          );
        })()}

        {/* ── Ayarlar Grid ──────────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>AYARLAR</Text>
        </View>
        <View style={styles.settingsGrid}>
          {[
            { icon: 'color-palette-outline', label: 'Görünüm', desc: 'Tema tercihleri', color: '#7C3AED' },
            { icon: 'notifications-outline', label: 'Bildirimler', desc: 'Kişisel tercihler', color: '#0891B2' },
            { icon: 'trending-up-outline', label: 'Performans', desc: 'Analiz istatistikleri', color: '#27AE60' },
            { icon: 'trophy-outline', label: 'Ligler', desc: 'Tüm liglere git', color: '#E6A817' },
          ].map((item, i) => (
            <TouchableOpacity key={item.label} style={[styles.settingsGridItem, { backgroundColor: c.surface }]}
              onPress={() => { if (item.label === 'Ligler') router.push('/leagues'); }}>
              <View style={[styles.settingsGridIcon, { backgroundColor: `${item.color}22` }]}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
              <Text style={[styles.settingsGridLabel, { color: c.text }]}>{item.label}</Text>
              <Text style={[styles.settingsGridDesc, { color: c.textFaint }]}>{item.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tema ─────────────────────────────────────────────────────────── */}
        <View style={[styles.settingsCard, { backgroundColor: c.surface }]}>
          <View style={styles.notifSectionHeader}>
            <Text style={[styles.notifSectionTitle, { color: c.textMuted }]}>TEMA</Text>
          </View>
          <Text style={[styles.themeAutoHint, { color: c.textFaint }]}>Otomatik: 07:00-19:59 açık, 20:00-06:59 koyu</Text>
          <View style={styles.themeSegmentRow}>
            {([['light', '☀️ Açık'], ['system', '⚙️ Otomatik'], ['dark', '🌙 Koyu']] as const).map(([m, label]) => (
              <TouchableOpacity key={m} onPress={() => setMode(m)}
                style={[styles.themeSegmentBtn, { borderColor: mode === m ? c.primary : c.border, backgroundColor: mode === m ? c.primaryLight : c.surface }]}>
                <Text style={[styles.themeSegmentText, { color: mode === m ? c.primary : c.textMuted, fontWeight: mode === m ? '600' : '400' }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.sectionSpacer} />

        {/* ── Bildirimler ───────────────────────────────────────────────────── */}
        <View style={[styles.settingsCard, { backgroundColor: c.surface }]}>
          <View style={styles.notifSectionHeader}>
            <Text style={[styles.notifSectionTitle, { color: c.textMuted }]}>BİLDİRİMLER</Text>
          </View>
          {[
            { key: 'daily' as keyof NotifPrefs, label: 'Günlük analiz bildirimi', sub: 'Her gün "Bugünün analizleri hazır"' },
            { key: 'favTeam' as keyof NotifPrefs, label: 'Maç hatırlatması', sub: 'Favori ve takip listesi takımları, maçtan 30 dk önce' },
            { key: 'featured' as keyof NotifPrefs, label: 'Öne çıkan maçlar', sub: 'Günün en yüksek puanlı maçı' },
          ].map((item, i, arr) => (
            <View key={item.key}>
              <View style={styles.settingsRow}>
                <View style={styles.notifLabelWrap}>
                  <Text style={[styles.settingsLabel, { color: c.text }]}>{item.label}</Text>
                  <Text style={[styles.notifSub, { color: c.textFaint }]}>{item.sub}</Text>
                </View>
                <Switch value={notifPrefs[item.key]} onValueChange={v => togglePref(item.key, v)} trackColor={{ false: c.border, true: c.primary }} thumbColor={c.surface} />
              </View>
              {i < arr.length - 1 && <View style={[styles.settingsDivider, { backgroundColor: c.borderLight }]} />}
            </View>
          ))}
        </View>

        <View style={styles.sectionSpacer} />

        {/* ── ScoutFootball Network ─────────────────────────────────────────── */}
        <Text style={[styles.sectionLabelStandalone, { color: c.textMuted }]}>SCOUTFOOTBALL NETWORK</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.networkRow}>
          {[
            { label: 'Instagram', icon: 'logo-instagram', color: '#E1306C', url: 'https://instagram.com/scoutfootballapp' },
            { label: 'X (Twitter)', icon: 'logo-twitter', color: '#1DA1F2', url: 'https://twitter.com/scoutfootballhq' },
            { label: 'TikTok', icon: 'logo-tiktok', color: '#69C9D0', url: 'https://tiktok.com/@scoutfootballapp' },
            { label: 'YouTube', icon: 'logo-youtube', color: '#FF0000', url: 'https://youtube.com' },
            { label: 'Discord', icon: 'chatbubbles-outline', color: '#5865F2', url: 'https://discord.gg' },
          ].map(item => (
            <TouchableOpacity key={item.label} style={[styles.networkPill, { backgroundColor: c.surface, borderColor: c.border }]}
              onPress={() => Linking.openURL(item.url)}>
              <Ionicons name={item.icon as any} size={16} color={item.color} />
              <Text style={[styles.networkPillText, { color: c.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Hakkında ─────────────────────────────────────────────────────── */}
        <View style={[styles.settingsCard, { backgroundColor: c.surface, marginTop: 12 }]}>
          <View style={styles.settingsRow}>
            <Text style={[styles.settingsLabel, { color: c.text }]}>Sürüm</Text>
            <Text style={[styles.settingsValue, { color: c.textMuted }]}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <BottomTabBar activeTab="profile" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1 },
  topbar:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 12, borderBottomWidth: 0.5 },
  topbarTitle:        { fontSize: 16, fontWeight: '600', textAlign: 'center', flex: 1 },
  headerBrand:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogo:         { width: 42, height: 42, resizeMode: 'contain' },
  appName:            { fontSize: 16, fontWeight: '600', color: '#00BAFF' },
  appNameBlue:        { color: '#2563EB' },
  scroll:             { flex: 1 },
  sectionSpacer:      { height: 12 },
  bottomSpacer:       { height: 30 },

  // ── Identity Card ────────────────────────────────────────────────────────────
  identityCard:       { flexDirection: 'row', alignItems: 'center', padding: 16, marginHorizontal: 14, marginTop: 14, borderRadius: 16, gap: 12 },
  avatarWrap:         { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  avatarRing:         { width: 72, height: 72, borderRadius: 36, borderWidth: 2.5, padding: 3, alignItems: 'center', justifyContent: 'center' },
  avatar:             { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  avatarText:         { fontSize: 22, fontWeight: '700', color: '#fff' },
  avatarEditDot:      { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  identityInfo:       { flex: 1, gap: 4 },
  nameEditRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput:          { flex: 1, fontSize: 18, fontWeight: '600', borderBottomWidth: 1.5, paddingBottom: 4 },
  saveBtn:            { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  saveBtnText:        { color: '#fff', fontSize: 13, fontWeight: '600' },
  scoutName:          { fontSize: 20, fontWeight: '700' },
  analystBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  analystText:        { fontSize: 11, fontWeight: '600' },
  leagueFocusText:    { fontSize: 11 },
  xpRow:              { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  xpStar:             { fontSize: 11, color: '#E6A817' },
  xpLevelText:        { fontSize: 11, fontWeight: '600' },
  xpTrack:            { flex: 1, height: 5, borderRadius: 2.5, overflow: 'hidden' },
  xpFill:             { height: 5, borderRadius: 2.5 },
  xpCounter:          { fontSize: 9 },
  tierBadge:          { alignItems: 'center', borderRadius: 12, padding: 10, minWidth: 68, gap: 2 },
  tierBadgeIcon:      { fontSize: 20 },
  tierBadgeTitle:     { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  tierBadgeTop:       { fontSize: 9, textAlign: 'center' },

  // ── Section headers ──────────────────────────────────────────────────────────
  sectionHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 20, paddingBottom: 8 },
  sectionLabel:       { fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  sectionLabelStandalone: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 10 },
  sectionAction:      { fontSize: 13, fontWeight: '500' },
  emptyHint:          { fontSize: 13, paddingHorizontal: 14, paddingBottom: 8, textAlign: 'center', marginTop: 4 },

  // ── Favori Takım ─────────────────────────────────────────────────────────────
  addTeamBtn:         { marginHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', paddingVertical: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  addTeamBtnIcon:     { fontSize: 22, fontWeight: '300' },
  addTeamBtnText:     { fontSize: 15, fontWeight: '500' },
  favCard:            { marginHorizontal: 14, borderRadius: 14, overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
  favCardStripe:      { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  favCardContent:     { padding: 16, paddingLeft: 20 },
  favErrorWrap:       { marginTop: 8 },
  favCardTop:         { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  favTeamBadge:       { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  favTeamBadgeText:   { fontSize: 14, fontWeight: '700' },
  favTeamInfo:        { flex: 1 },
  favTeamName:        { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 2 },
  favLeagueName:      { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  favStatsRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: 12 },
  favStatItem:        { flex: 1, alignItems: 'center' },
  favSkeletonRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: 14, marginTop: 8 },
  favSkeletonItem:    { flex: 1, alignItems: 'center', gap: 6 },
  favSkeletonVal:     { width: '60%', height: 16, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.25)' },
  favSkeletonLbl:     { width: '45%', height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.15)' },
  favStatValue:       { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 3 },
  favStatLabel:       { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '500', textAlign: 'center' },
  favStatDivider:     { width: 0.5, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  formDots:           { flexDirection: 'row', gap: 5, minHeight: 20, alignItems: 'center', justifyContent: 'center' },
  formDot:            { width: 18, height: 18, borderRadius: 9 },

  // ── Watchlist horizontal cards ────────────────────────────────────────────────
  wlScroll:           { paddingHorizontal: 14, gap: 10, paddingBottom: 4 },
  wlCard:             { width: 148, borderRadius: 14, padding: 12, gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  wlCloseBtn:         { position: 'absolute', top: 8, right: 8, zIndex: 1 },
  wlBadge:            { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  wlBadgeText:        { fontSize: 13, fontWeight: '700', color: '#fff' },
  wlName:             { fontSize: 12, fontWeight: '700', paddingRight: 16 },
  wlLeague:           { fontSize: 10 },
  wlTagPill:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 2 },
  wlTagDot:           { width: 6, height: 6, borderRadius: 3 },
  wlTagText:          { fontSize: 10, fontWeight: '600' },
  wlFormRow:          { flexDirection: 'row', gap: 4, marginTop: 4 },
  wlFormDot:          { width: 12, height: 12, borderRadius: 6 },

  // ── Son Bakılanlar ────────────────────────────────────────────────────────────
  recentCard:         { marginHorizontal: 14, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  recentRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  recentIcon:         { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recentIconText:     { fontSize: 12, fontWeight: '700' },
  recentInfo:         { flex: 1 },
  recentName:         { fontSize: 13, fontWeight: '600' },
  recentLeague:       { fontSize: 11, marginTop: 1 },
  recentSrWrap:       { alignItems: 'center', gap: 1 },
  recentSrVal:        { fontSize: 13, fontWeight: '700' },
  recentSrLbl:        { fontSize: 9 },
  recentTime:         { fontSize: 11 },

  // ── Scout Insight ─────────────────────────────────────────────────────────────
  insightCard:        { marginHorizontal: 14, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  insightLeft:        { flex: 1, gap: 6 },
  insightTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  insightTitle:       { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  insightText:        { fontSize: 13, lineHeight: 19 },
  insightRight:       { alignItems: 'center', gap: 4 },
  insightDonutWrap:   { alignItems: 'center', justifyContent: 'center' },
  insightDonutCenter: { position: 'absolute' },
  insightDonutPct:    { fontSize: 14, fontWeight: '800' },
  insightDonutLbl:    { fontSize: 9, textAlign: 'center', maxWidth: 72 },

  // ── Settings Grid 2x2 ────────────────────────────────────────────────────────
  settingsGrid:       { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8, marginBottom: 12 },
  settingsGridItem:   { width: '47%', flexGrow: 1, borderRadius: 14, padding: 14, gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  settingsGridIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  settingsGridLabel:  { fontSize: 13, fontWeight: '600' },
  settingsGridDesc:   { fontSize: 11 },

  // ── Settings cards ────────────────────────────────────────────────────────────
  settingsCard:       { marginHorizontal: 14, borderRadius: 12, overflow: 'hidden' },
  settingsRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  settingsLabel:      { fontSize: 14 },
  settingsValue:      { fontSize: 13 },
  settingsDivider:    { height: 0.5, marginLeft: 14 },
  themeSegmentRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  themeSegmentBtn:    { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1.5 },
  themeSegmentText:   { fontSize: 12 },
  notifSectionHeader: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  notifSectionTitle:  { fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  themeAutoHint:      { fontSize: 11, paddingHorizontal: 14, paddingBottom: 10 },
  notifLabelWrap:     { flex: 1, paddingRight: 12 },
  notifSub:           { fontSize: 11, marginTop: 2 },

  // ── Network pills ────────────────────────────────────────────────────────────
  networkRow:         { paddingHorizontal: 14, gap: 8 },
  networkPill:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 0.5 },
  networkPillText:    { fontSize: 13, fontWeight: '500' },

  // ── Scout Performansı ─────────────────────────────────────────────────────────
  pickAccCard:        { marginHorizontal: 14, marginBottom: 10, borderRadius: 12, padding: 14 },
  pickAccTop:         { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 10 },
  pickAccScore:       { fontSize: 26, fontWeight: '800' },
  pickAccTotal:       { fontSize: 18, fontWeight: '600' },
  pickAccLabel:       { fontSize: 13, flex: 1 },
  pickAccPct:         { fontSize: 20, fontWeight: '800' },
  pickAccBarBg:       { height: 6, borderRadius: 3, overflow: 'hidden' },
  pickAccBarFill:     { height: 6, borderRadius: 3 },
  pickRow:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  pickIconWrap:       { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  pickIcon:           { fontSize: 13, fontWeight: '700' },
  pickRowContent:     { flex: 1 },
  pickTeams:          { fontSize: 13, fontWeight: '600' },
  pickMeta:           { fontSize: 11, marginTop: 2 },
  pickMoreHint:       { textAlign: 'center', fontSize: 12, paddingVertical: 8 },

  // ── Team picker modal ─────────────────────────────────────────────────────────
  bsOverlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  bsDismissArea:      { flex: 1 },
  bsContainer:        { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  bsHandle:           { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 2 },
  bsHeader:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  bsTitle:            { fontSize: 16, fontWeight: '600' },
  bsSearch:           { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  pickerSearchInput:  { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  pickerLeagueHeader: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 0.5 },
  pickerLeagueTitle:  { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  pickerTeamRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 0.5, gap: 12 },
  pickerTeamDot:      { width: 10, height: 10, borderRadius: 5 },
  pickerTeamName:     { flex: 1, fontSize: 15 },
  pickerLoadingText:  { paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, textAlign: 'center' },
  pickerBottomSpacer: { height: 40 },

  // ── Avatar picker modal ───────────────────────────────────────────────────────
  avatarModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  avatarModalBox:     { borderRadius: 16, padding: 24, width: 280, alignItems: 'center' },
  avatarModalTitle:   { fontSize: 16, fontWeight: '600', marginBottom: 20 },
  avatarGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 20 },
  avatarOption:       { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarOptionSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  avatarCheck:        { fontSize: 20, color: '#fff', fontWeight: '700' },
  avatarModalCancel:  { paddingVertical: 10 },
  avatarModalCancelText: { fontSize: 15 },
});

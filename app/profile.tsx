import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, Image, Linking, Modal, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
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
import { parseForm, transliterate } from '../utils/teamStats';
import { isArrayOf, readTimedCache, writeTimedCache } from '../utils/timedCache';

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamSummaryStats = {
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  pts: number;
  pos: number;
};

type TeamStatsRouteTeam = {
  name: string;
  teamId: number;
  leagueName: string;
  leagueFlag: string;
  apiId: number;
};

type PickerTeam = { name: string; teamId: number };

type TeamStatsRouteParams = {
  teamName: string;
  teamId: number;
  leagueName: string;
  leagueFlag: string;
  apiId: number;
  fdId: number;
} & TeamSummaryStats;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_TEAM_STATS: TeamSummaryStats = {
  played: 0,
  win: 0,
  draw: 0,
  loss: 0,
  gf: 0,
  ga: 0,
  pts: 0,
  pos: 0,
};

function buildTeamStatsParams(team: TeamStatsRouteTeam, stats?: TeamSummaryStats): TeamStatsRouteParams {
  const safeStats = stats ?? EMPTY_TEAM_STATS;
  return {
    teamName: team.name,
    teamId: team.teamId,
    leagueName: team.leagueName,
    leagueFlag: team.leagueFlag,
    apiId: team.apiId,
    fdId: 0,
    pos: safeStats.pos,
    played: safeStats.played,
    win: safeStats.win,
    draw: safeStats.draw,
    loss: safeStats.loss,
    gf: safeStats.gf,
    ga: safeStats.ga,
    pts: safeStats.pts,
  };
}

function standingsToPickerTeams(rows: Standing[]): PickerTeam[] {
  return rows
    .filter(row => row.team)
    .map(row => ({ name: row.team, teamId: row.teamId || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE = {
  NAME: 'scout_name',
  AVATAR: 'scout_avatar',
  FAV_TEAM: 'scout_fav_team',
  WATCHLIST: 'scout_watchlist',
  RECENT: 'scout_recent',
};

const TEAM_PICKER_TTL = 60 * 60 * 1000;

function teamPickerCacheKey(apiId: number) {
  return `profile_team_picker_standings_v1_${apiId}`;
}

const AVATAR_COLORS = [
  '#185FA5', '#A32D2D', '#27500A', '#E6A817',
  '#6B1414', '#1A1A1A', '#7C3AED', '#0E7490',
];

const LEAGUES_TEAMS: { leagueName: string; apiId: number; flag: string; teams: { name: string; teamId: number }[] }[] = [
  {
    leagueName: 'Süper Lig', apiId: 203, flag: '🇹🇷',
    teams: [
      { name: 'Galatasaray', teamId: 133804 }, { name: 'Fenerbahçe', teamId: 133807 },
      { name: 'Beşiktaş', teamId: 133794 },    { name: 'Trabzonspor', teamId: 133796 },
      { name: 'Başakşehir', teamId: 134589 },  { name: 'Samsunspor', teamId: 133797 },
      { name: 'Göztepe', teamId: 135891 },     { name: 'Çaykur Rizespor', teamId: 133885 },
      { name: 'Konyaspor', teamId: 133835 },   { name: 'Gaziantep FK', teamId: 138092 },
      { name: 'Kocaelispor', teamId: 133870 }, { name: 'Alanyaspor', teamId: 135676 },
      { name: 'Antalyaspor', teamId: 133799 }, { name: 'Gençlerbirliği', teamId: 133798 },
      { name: 'Eyüpspor', teamId: 138977 },    { name: 'Kayserispor', teamId: 133802 },
      { name: 'Fatih Karagümrük', teamId: 138983 }, { name: 'Kasımpaşa', teamId: 133834 },
    ],
  },
  {
    leagueName: 'Premier Lig', apiId: 39, flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    teams: [
      { name: 'Arsenal', teamId: 57 },          { name: 'Aston Villa', teamId: 58 },
      { name: 'Chelsea', teamId: 61 },           { name: 'Everton', teamId: 62 },
      { name: 'Liverpool', teamId: 64 },         { name: 'Manchester City', teamId: 65 },
      { name: 'Manchester United', teamId: 66 }, { name: 'Newcastle', teamId: 67 },
      { name: 'Tottenham', teamId: 73 },         { name: 'West Ham', teamId: 563 },
    ],
  },
  {
    leagueName: 'La Liga', apiId: 140, flag: '🇪🇸',
    teams: [
      { name: 'Real Madrid', teamId: 86 },      { name: 'Barcelona', teamId: 81 },
      { name: 'Atlético Madrid', teamId: 78 },  { name: 'Sevilla', teamId: 559 },
      { name: 'Valencia', teamId: 558 },         { name: 'Villarreal', teamId: 514 },
    ],
  },
  {
    leagueName: 'Bundesliga', apiId: 78, flag: '🇩🇪',
    teams: [
      { name: 'Bayern Münih', teamId: 5 },          { name: 'Borussia Dortmund', teamId: 4 },
      { name: 'Bayer Leverkusen', teamId: 3 },       { name: 'RB Leipzig', teamId: 721 },
      { name: 'Eintracht Frankfurt', teamId: 9 },
    ],
  },
  {
    leagueName: 'Serie A', apiId: 135, flag: '🇮🇹',
    teams: [
      { name: 'AC Milan', teamId: 103 },   { name: 'Inter Milan', teamId: 108 },
      { name: 'Juventus', teamId: 109 },   { name: 'Napoli', teamId: 113 },
      { name: 'Roma', teamId: 100 },       { name: 'Atalanta', teamId: 102 },
      { name: 'Fiorentina', teamId: 99 },  { name: 'Lazio', teamId: 110 },
    ],
  },
  {
    leagueName: 'Ligue 1', apiId: 61, flag: '🇫🇷',
    teams: [
      { name: 'Paris Saint-Germain', teamId: 524 }, { name: 'Monaco', teamId: 548 },
      { name: 'Olympique Marseille', teamId: 516 },  { name: 'Lyon', teamId: 523 },
      { name: 'Lille', teamId: 521 },
    ],
  },
];

const TEAM_COLORS: Record<string, { p: string; s: string }> = {
  'Galatasaray': { p: '#C8102E', s: '#F5A623' },
  'Fenerbahçe': { p: '#1B3D7F', s: '#FFD700' },
  'Beşiktaş': { p: '#1A1A1A', s: '#CCCCCC' },
  'Trabzonspor': { p: '#6B1414', s: '#1A3F6F' },
  'Başakşehir': { p: '#FF6B00', s: '#0C2D6B' },
  'Samsunspor': { p: '#E30613', s: '#1B5AA8' },
  'Göztepe': { p: '#FF7A00', s: '#FFC200' },
  'Eyüpspor': { p: '#0C4B7F', s: '#C8A000' },
  'Konyaspor': { p: '#005B30', s: '#FFFFFF' },
  'Kayserispor': { p: '#D4000E', s: '#FFCD00' },
  'Antalyaspor': { p: '#C0392B', s: '#FFFFFF' },
  'Alanyaspor': { p: '#E05206', s: '#1A3F6F' },
  'Gaziantep FK': { p: '#D4000E', s: '#1A1A1A' },
  'Kocaelispor': { p: '#00529F', s: '#E30613' },
  'Çaykur Rizespor': { p: '#003087', s: '#E30613' },
  'Gençlerbirliği': { p: '#E30613', s: '#1A1A1A' },
  'Fatih Karagümrük': { p: '#C8102E', s: '#1A1A1A' },
  'Arsenal': { p: '#EF0107', s: '#FFFFFF' },
  'Chelsea': { p: '#034694', s: '#FFFFFF' },
  'Liverpool': { p: '#C8102E', s: '#F6EB61' },
  'Manchester City': { p: '#6CABDD', s: '#1C2C5B' },
  'Manchester United': { p: '#DA291C', s: '#FFE500' },
  'Tottenham': { p: '#132257', s: '#FFFFFF' },
  'Newcastle': { p: '#241F20', s: '#FFFFFF' },
  'Aston Villa': { p: '#670E36', s: '#CEFFDB' },
  'Real Madrid': { p: '#FEBE10', s: '#00529F' },
  'Barcelona': { p: '#A50044', s: '#004D98' },
  'Atlético Madrid': { p: '#CE3524', s: '#FFFFFF' },
  'Bayern Münih': { p: '#DC052D', s: '#0066B2' },
  'Borussia Dortmund': { p: '#FFE01A', s: '#1A1A1A' },
  'Bayer Leverkusen': { p: '#E32221', s: '#000000' },
  'RB Leipzig': { p: '#DD0741', s: '#001D62' },
  'AC Milan': { p: '#FB090B', s: '#1A1A1A' },
  'Inter Milan': { p: '#010E80', s: '#1A1A1A' },
  'Juventus': { p: '#1A1A1A', s: '#FFFFFF' },
  'Napoli': { p: '#12A0C2', s: '#FFFFFF' },
  'Roma': { p: '#A52A2A', s: '#F5C518' },
  'Atalanta': { p: '#1A4797', s: '#000000' },
  'Paris Saint-Germain': { p: '#004170', s: '#DA291C' },
  'Monaco': { p: '#E4000E', s: '#FFFFFF' },
  'Olympique Marseille': { p: '#26C5E8', s: '#FFFFFF' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTeamColors(name: string): { p: string; s: string } {
  for (const key of Object.keys(TEAM_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(name.toLowerCase())) {
      return TEAM_COLORS[key];
    }
  }
  return { p: '#185FA5', s: '#0C447C' };
}


function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
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
              const h = Number(event.intHomeScore);
              const a = Number(event.intAwayScore);
              return Number.isFinite(h) && Number.isFinite(a) ? { home: h, away: a } : null;
            } else {
              const data = await getMatchStats(pick.id);
              if (!data || data.status !== 'FINISHED') return null;
              const h = data.score?.fullTime?.home;
              const a = data.score?.fullTime?.away;
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
      // Profile should reload on focus; loadAll is kept stable by screen state ownership.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  async function loadAll() {
    const [name, avt, favRaw, wlRaw, recentRaw, prefs] = await Promise.all([
      AsyncStorage.getItem(STORAGE.NAME),
      AsyncStorage.getItem(STORAGE.AVATAR),
      AsyncStorage.getItem(STORAGE.FAV_TEAM),
      AsyncStorage.getItem(STORAGE.WATCHLIST),
      AsyncStorage.getItem(STORAGE.RECENT),
      loadNotifPrefs(),
    ]);
    const name_ = name || '';
    const avt_ = avt ? parseInt(avt) : 0;
    const fav_ = parseFavTeam(favRaw);
    const wl_ = parseFavTeamList(wlRaw);
    const recent_ = parseRecentItems(recentRaw);

    setScoutName(name_);
    setAvatarIdx(avt_);
    setFavTeam(fav_);
    setWatchlist(wl_);
    setRecentlyViewed(recent_);
    setNotifPrefs(prefs);

    if (fav_) loadFavTeamData(fav_);
    if (wl_.length > 0) loadWatchlistForms(wl_);
    if (recent_.length > 0) loadRecentStats(recent_);
  }

  async function loadFavTeamData(team: FavTeam) {
    setLoadingFav(true);
    setFavLoadError(false);
    try {
      const [matches, standings] = await Promise.all([
        team.apiId === 203
          ? getSuperLigTeamForm(team.teamId)
          : getTeamForm(team.teamId),
        team.apiId === 203
          ? getSuperLigStandings()
          : getStandings(team.apiId),
      ]);

      if (standings.length > 0) {
        const lPts = standings[0].pts;
        const found = standings.find(s =>
          transliterate(s.team).includes(transliterate(team.name))
          || transliterate(team.name).includes(transliterate(s.team))
        );
        if (found) {
          setFavPos(found.pos);
          setFavPts(found.pts);
          setLeaderPts(lPts);
          setFavPlayed(found.played ?? 0);
          setFavWin(found.win ?? 0);
          setFavDraw(found.draw ?? 0);
          setFavLoss(found.loss ?? 0);
          setFavGf(found.gf ?? 0);
          setFavGa(found.ga ?? 0);
        }
      }

      const form = parseForm(matches, team.teamId, team.apiId === 203).slice(-5);
      setFavForm(form);
    } catch {
      setFavLoadError(true);
    }
    setLoadingFav(false);
  }

  async function loadWatchlistForms(wl: FavTeam[]) {
    setLoadingWatchlist(true);
    const forms: Record<number, string[]> = {};
    const stats: Record<string, TeamSummaryStats> = {};

    // standings: lig başına bir kez çek
    const uniqueApiIds = [...new Set(wl.map(t => t.apiId))];
    const standingsMap: Record<number, Standing[]> = {};
    await Promise.all(
      uniqueApiIds.map(async (apiId) => {
        try {
          standingsMap[apiId] = apiId === 203
            ? await getSuperLigStandings()
            : await getStandings(apiId);
        } catch { standingsMap[apiId] = []; }
      })
    );

    await Promise.all(
      wl.slice(0, 5).map(async (team) => {
        try {
          const matches = team.apiId === 203
            ? await getSuperLigTeamForm(team.teamId)
            : await getTeamForm(team.teamId);
          forms[team.teamId || -Math.random()] = parseForm(matches, team.teamId, team.apiId === 203).slice(-3);
        } catch {}

        const rows = standingsMap[team.apiId] || [];
        const found = rows.find((s) =>
          transliterate(s.team || '').includes(transliterate(team.name))
          || transliterate(team.name).includes(transliterate(s.team || ''))
        );
        if (found) {
          stats[team.name] = {
            played: found.played ?? 0, win: found.win ?? 0, draw: found.draw ?? 0,
            loss: found.loss ?? 0, gf: found.gf ?? 0, ga: found.ga ?? 0,
            pts: found.pts ?? 0, pos: found.pos ?? 0,
          };
        }
      })
    );

    setWatchlistForms(forms);
    setWatchlistStats(stats);
    setLoadingWatchlist(false);
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    setScoutName(trimmed);
    setEditingName(false);
    await AsyncStorage.setItem(STORAGE.NAME, trimmed);
  }

  async function loadRecentStats(items: RecentItem[]) {

    const uniqueApiIds = [...new Set(items.map(r => r.apiId))];
    const standingsMap: Record<number, Standing[]> = {};
    await Promise.all(
      uniqueApiIds.map(async (apiId) => {
        try {
          standingsMap[apiId] = apiId === 203
            ? await getSuperLigStandings()
            : await getStandings(apiId);
        } catch { standingsMap[apiId] = []; }
      })
    );

    const stats: Record<string, TeamSummaryStats> = {};
    for (const item of items) {
      const rows = standingsMap[item.apiId] || [];
      const found = rows.find((s) =>
        transliterate(s.team || '').includes(transliterate(item.name))
        || transliterate(item.name).includes(transliterate(s.team || ''))
      );
      if (found) {
        stats[item.name] = {
          played: found.played ?? 0, win: found.win ?? 0, draw: found.draw ?? 0,
          loss: found.loss ?? 0, gf: found.gf ?? 0, ga: found.ga ?? 0,
          pts: found.pts ?? 0, pos: found.pos ?? 0,
        };
      }
    }
    setRecentStats(stats);
  }

  async function selectTeam(leagueFlag: string, leagueName: string, apiId: number, teamName: string, teamId: number) {
    const team: FavTeam = { name: teamName, teamId, apiId, leagueName, leagueFlag };
    setTeamPickerVisible(false);
    setTeamSearch('');

    if (teamPickerMode === 'fav') {
      setFavTeam(team);
      setFavForm([]);
      setFavPos(0);
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
      const cached = force
        ? null
        : await readTimedCache(cacheKey, TEAM_PICKER_TTL, isArrayOf(isStanding));
      if (cached && cached.length > 0) {
        next[league.apiId] = standingsToPickerTeams(cached);
      }
      try {
        const standings = league.apiId === 203
          ? await getSuperLigStandings()
          : await getStandings(league.apiId, { silent: Boolean(cached?.length) });
        if (standings.length > 0) {
          next[league.apiId] = standingsToPickerTeams(standings);
          writeTimedCache(cacheKey, standings);
        }
      } catch {}
    }));

    setPickerTeamsByLeague(next);
    setLoadingTeamPicker(false);
  }

  function openTeamPicker(mode: 'fav' | 'watchlist') {
    setTeamPickerMode(mode);
    setTeamPickerVisible(true);
    void loadTeamPickerTeams();
  }

  async function removeFavTeam() {
    setFavTeam(null);
    setFavForm([]);
    setFavPos(0);
    await AsyncStorage.removeItem(STORAGE.FAV_TEAM);
  }

  async function removeWatchlistItem(teamName: string) {
    const updated = watchlist.filter(t => t.name !== teamName);
    setWatchlist(updated);
    await AsyncStorage.setItem(STORAGE.WATCHLIST, JSON.stringify(updated));
  }

  async function togglePref(key: keyof NotifPrefs, val: boolean) {
    const updated = { ...notifPrefs, [key]: val };
    const anyWillBeEnabled = updated.daily || updated.favTeam || updated.featured;

    if (val && anyWillBeEnabled) {
      const granted = await requestPermissions();
      if (!granted) {
        Alert.alert(
          'Bildirim izni gerekli',
          'Lütfen uygulama ayarlarından bildirim iznini etkinleştirin.',
        );
        return;
      }
    }

    if (!anyWillBeEnabled) await cancelAllNotifications();

    setNotifPrefs(updated);
    await saveNotifPrefs(updated);

    if (anyWillBeEnabled) {
      await registerPushToken(updated, watchedTeamNames);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        favTeam ? loadFavTeamData(favTeam) : Promise.resolve(),
        watchlist.length > 0 ? loadWatchlistForms(watchlist) : Promise.resolve(),
        recentlyViewed.length > 0 ? loadRecentStats(recentlyViewed) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  function goToTeamStats(team: FavTeam) {
    router.push({
      pathname: '/team_stats',
      params: buildTeamStatsParams(team, favSummaryStats),
    });
  }

  // ─── Team Picker Modal ──────────────────────────────────────────────────────

  const filteredLeagues = useMemo(() =>
    LEAGUES_TEAMS.map(lg => ({
      ...lg,
      teams: (pickerTeamsByLeague[lg.apiId]?.length ? pickerTeamsByLeague[lg.apiId] : lg.teams).filter(t =>
        !teamSearch || transliterate(t.name).toLowerCase().includes(transliterate(teamSearch).toLowerCase())
      ),
    })).filter(lg => lg.teams.length > 0),
  [pickerTeamsByLeague, teamSearch]);

  const avatarColor = useMemo(() => AVATAR_COLORS[avatarIdx] || '#185FA5', [avatarIdx]);
  const avatarLabel = useMemo(() => scoutName ? scoutName.trim().slice(0, 2).toUpperCase() : '?', [scoutName]);
  const favColors = useMemo(() => favTeam ? getTeamColors(favTeam.name) : { p: '#185FA5', s: '#0C447C' }, [favTeam]);
  const favSummaryStats = useMemo<TeamSummaryStats>(() => ({
    played: favPlayed,
    win: favWin,
    draw: favDraw,
    loss: favLoss,
    gf: favGf,
    ga: favGa,
    pts: favPts,
    pos: favPos,
  }), [favDraw, favGa, favGf, favLoss, favPlayed, favPos, favPts, favWin]);
  const watchedTeamNames = useMemo(() => [
    favTeam?.name,
    ...watchlist.map(team => team.name),
  ].filter(Boolean) as string[], [favTeam, watchlist]);
  const watchlistRows = useMemo(() => watchlist.map(team => ({
    team,
    colors: getTeamColors(team.name),
    form: watchlistForms[team.teamId] || [],
    stats: watchlistStats[team.name],
  })), [watchlist, watchlistForms, watchlistStats]);
  const recentRows = useMemo(() => recentlyViewed.slice(0, 8).map((item, index) => ({
    item,
    index,
    stats: recentStats[item.name],
  })), [recentlyViewed, recentStats]);

  function renderTeamPicker() {
    return (
      <Modal visible={teamPickerVisible} animationType="slide" onRequestClose={() => { setTeamPickerVisible(false); setTeamSearch(''); }}>
        <View style={[styles.modalContainer, { backgroundColor: c.surface }]}>
          <View style={[styles.modalHeader, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>
              {teamPickerMode === 'fav' ? 'Favori Takım Seç' : 'Takip Listesine Ekle'}
            </Text>
            <TouchableOpacity onPress={() => { setTeamPickerVisible(false); setTeamSearch(''); }}>
              <Text style={[styles.modalClose, { color: c.primary }]}>Kapat</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.searchBox, { borderBottomColor: c.borderLight }]}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: c.surfaceAlt, color: c.text }]}
              placeholder="Takım ara..."
              placeholderTextColor={c.textMuted}
              value={teamSearch}
              onChangeText={setTeamSearch}
              autoCorrect={false}
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {loadingTeamPicker && Object.keys(pickerTeamsByLeague).length === 0 && (
              <Text style={[styles.pickerLoadingText, { color: c.textMuted }]}>Takımlar yükleniyor...</Text>
            )}
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
                    <Text style={[styles.pickerArrow, { color: c.textVeryFaint }]}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <View style={styles.pickerBottomSpacer} />
          </ScrollView>
        </View>
      </Modal>
    );
  }

  // ─── Avatar Picker Modal ────────────────────────────────────────────────────

  function renderAvatarPicker() {
    return (
      <Modal visible={avatarPickerVisible} animationType="fade" transparent onRequestClose={() => setAvatarPickerVisible(false)}>
        <View style={styles.avatarModalOverlay}>
          <View style={[styles.avatarModalBox, { backgroundColor: c.surface }]}>
            <Text style={[styles.avatarModalTitle, { color: c.text }]}>Renk Seç</Text>
            <View style={styles.avatarGrid}>
              {AVATAR_COLORS.map((color, i) => (
                <TouchableOpacity key={i} style={[styles.avatarOption, { backgroundColor: color },
                  i === avatarIdx && styles.avatarOptionSelected]}
                  onPress={async () => {
                    setAvatarIdx(i);
                    await AsyncStorage.setItem(STORAGE.AVATAR, String(i));
                    setAvatarPickerVisible(false);
                  }}>
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

      {/* Top Bar */}
      <View style={[styles.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.headerBrand}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        </View>
        <Text style={[styles.topbarTitle, { color: c.text }]}>Scout Rozeti</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}
      >

        {/* ── Scout Kimlik Kartı ── */}
        <View style={[styles.identityCard, { backgroundColor: c.surface }, cardShadow(isDark)]}>
          <TouchableOpacity style={[styles.avatar, { backgroundColor: avatarColor }]}
            onPress={() => setAvatarPickerVisible(true)}>
            <Text style={styles.avatarText}>{avatarLabel}</Text>
          </TouchableOpacity>
          <View style={styles.identityInfo}>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={[styles.nameInput, { color: c.text, borderBottomColor: c.primary }]}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Scout adın..."
                  placeholderTextColor={c.textMuted}
                  autoFocus
                  onSubmitEditing={saveName}
                />
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.primary }]} onPress={saveName}>
                  <Text style={styles.saveBtnText}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { setNameInput(scoutName); setEditingName(true); }}>
                <Text style={[styles.scoutName, { color: c.text }]}>{scoutName || 'Adın ne olsun?'}</Text>
                <Text style={[styles.scoutNameHint, { color: c.textFaint }]}>Düzenlemek için dokun</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Favori Takım ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>FAVORİ TAKIM</Text>
          {favTeam && (
            <TouchableOpacity onPress={removeFavTeam}>
              <Text style={[styles.sectionAction, { color: c.primary }]}>Kaldır</Text>
            </TouchableOpacity>
          )}
        </View>

        {favTeam ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => goToTeamStats(favTeam)}>
            <View style={[styles.favCard, { backgroundColor: favColors.p }]}>
              <View style={[styles.favCardStripe, { backgroundColor: favColors.s }]} />
              <View style={styles.favCardContent}>
                <View style={styles.favCardTop}>
                  <View style={[styles.favTeamBadge, { backgroundColor: favColors.s }]}>
                    <Text style={[styles.favTeamBadgeText, { color: favColors.p }]}>
                      {favTeam.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.favTeamInfo}>
                    <Text style={styles.favTeamName}>{favTeam.name}</Text>
                    <Text style={styles.favLeagueName}>{favTeam.leagueFlag} {favTeam.leagueName}</Text>
                  </View>
                </View>

                {loadingFav ? (
                  <View style={styles.favSkeletonRow}>
                    {[0, 1, 2].map(i => (
                      <View key={i} style={styles.favSkeletonItem}>
                        <View style={styles.favSkeletonVal} />
                        <View style={styles.favSkeletonLbl} />
                      </View>
                    ))}
                  </View>
                ) : favLoadError ? (
                  <View style={styles.favErrorWrap}>
                    <EmptyStateCard
                      compact
                      icon="wifi-outline"
                      title="Takım verisi alınamadı"
                      onRetry={() => favTeam && loadFavTeamData(favTeam)}
                      retryLabel="Tekrar Dene"
                    />
                  </View>
                ) : (
                  <View style={styles.favStatsRow}>
                    <View style={styles.favStatItem}>
                      <Text style={styles.favStatValue}>
                        {favPos > 0 ? `${favPos}. Sıra` : '—'}
                      </Text>
                      <Text style={styles.favStatLabel}>Puan Durumu</Text>
                    </View>
                    <View style={styles.favStatDivider} />
                    <View style={styles.favStatItem}>
                      <Text style={styles.favStatValue}>
                        {favPos > 0 && leaderPts > 0
                          ? favPos === 1 ? 'Lider' : `-${leaderPts - favPts} P`
                          : '—'}
                      </Text>
                      <Text style={styles.favStatLabel}>Liderden Fark</Text>
                    </View>
                    <View style={styles.favStatDivider} />
                    <View style={styles.favStatItem}>
                      <View style={styles.formDots}>
                        {favForm.length > 0
                          ? favForm.map((r, i) => (
                            <View key={i} style={[styles.formDot,
                              r === 'G' ? { backgroundColor: c.win } : r === 'B' ? { backgroundColor: c.draw } : { backgroundColor: c.loss }]}>
                              <Text style={styles.formDotText}>{r}</Text>
                            </View>
                          ))
                          : <Text style={styles.favStatValue}>—</Text>
                        }
                      </View>
                      <Text style={styles.favStatLabel}>Son 5 Maç</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.addTeamBtn, { borderColor: c.primary }]}
            onPress={() => openTeamPicker('fav')}>
            <Text style={[styles.addTeamBtnIcon, { color: c.primary }]}>+</Text>
            <Text style={[styles.addTeamBtnText, { color: c.primary }]}>Favori takımını seç</Text>
          </TouchableOpacity>
        )}

        {/* ── Takip Listesi ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>TAKİP LİSTESİ</Text>
          <TouchableOpacity onPress={() => openTeamPicker('watchlist')}>
            <Text style={[styles.sectionAction, { color: c.primary }]}>+ Ekle</Text>
          </TouchableOpacity>
        </View>

        {watchlist.length === 0 ? (
          <Text style={[styles.emptyHint, { color: c.textFaint }]}>İzlemek istediğin takımları buraya ekle.</Text>
        ) : (
          watchlistRows.map(({ team, colors, form, stats }) => {
            return (
              <TouchableOpacity key={team.name} style={[styles.watchlistItem, { backgroundColor: c.surface, borderBottomColor: c.borderLight }]}
                onPress={() => router.push({ pathname: '/team_stats', params: buildTeamStatsParams(team, stats) })}>
                <View style={[styles.watchlistDot, { backgroundColor: colors.p }]} />
                <View style={styles.watchlistInfo}>
                  <Text style={[styles.watchlistName, { color: c.text }]}>{team.name}</Text>
                  <Text style={[styles.watchlistLeague, { color: c.textMuted }]}>{team.leagueFlag} {team.leagueName}</Text>
                </View>
                <View style={styles.watchlistForm}>
                  {loadingWatchlist && form.length === 0
                    ? [0, 1, 2].map(i => (
                        <View key={i} style={[styles.formDotSm, { backgroundColor: c.borderLight }]} />
                      ))
                    : form.map((r, i) => (
                        <View key={i} style={[styles.formDotSm,
                          r === 'G' ? { backgroundColor: c.win } : r === 'B' ? { backgroundColor: c.draw } : { backgroundColor: c.loss }]}>
                          <Text style={styles.formDotSmText}>{r}</Text>
                        </View>
                      ))
                  }
                </View>
                <TouchableOpacity style={styles.watchlistRemove}
                  onPress={() => removeWatchlistItem(team.name)}>
                  <Ionicons name="close" size={16} color={c.textVeryFaint} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}

        {/* ── Son Bakılanlar ── */}
        {recentlyViewed.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: c.textMuted }]}>SON BAKILANLAR</Text>
              <TouchableOpacity onPress={async () => {
                await AsyncStorage.removeItem(STORAGE.RECENT);
                setRecentlyViewed([]);
              }}>
                <Text style={[styles.sectionAction, { color: c.primary }]}>Temizle</Text>
              </TouchableOpacity>
            </View>
            {recentRows.map(({ item, index, stats }) => {
              return (
              <TouchableOpacity key={`${item.apiId}-${item.id}-${index}`} style={[styles.recentItem, { backgroundColor: c.surface, borderBottomColor: c.borderLight }]}
                onPress={() => router.push({ pathname: '/team_stats', params: buildTeamStatsParams({
                  name: item.name,
                  teamId: item.id,
                  leagueName: item.leagueName,
                  leagueFlag: '',
                  apiId: item.apiId,
                }, stats) })}>
                <View style={[styles.recentIcon, { backgroundColor: c.primaryLight }]}>
                  <Text style={[styles.recentIconText, { color: c.primaryDark }]}>
                    {item.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.recentInfo}>
                  <Text style={[styles.recentName, { color: c.text }]}>{item.name}</Text>
                  <Text style={[styles.recentLeague, { color: c.textMuted }]}>{item.leagueName}</Text>
                </View>
                <Text style={[styles.recentTime, { color: c.textFaint }]}>{timeAgo(item.timestamp)}</Text>
              </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── Scout Performansı ── */}
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
                    <Text style={[styles.pickAccScore, { color: c.text }]}>
                      {acc.correct}<Text style={[styles.pickAccTotal, { color: c.textMuted }]}>/{acc.total}</Text>
                    </Text>
                    <Text style={[styles.pickAccLabel, { color: c.textSub }]}>isabetli tahmin</Text>
                    <Text style={[styles.pickAccPct, { color: acc.pct >= 60 ? c.win : acc.pct >= 40 ? (isDark ? '#E3B341' : '#B7791F') : c.loss }]}>
                      %{acc.pct}
                    </Text>
                  </View>
                  <View style={[styles.pickAccBarBg, { backgroundColor: c.borderLight }]}>
                    <View style={[styles.pickAccBarFill, {
                      width: `${acc.pct}%`,
                      backgroundColor: acc.pct >= 60 ? c.win : acc.pct >= 40 ? (isDark ? '#E3B341' : '#B7791F') : c.loss,
                    }]} />
                  </View>
                </View>
              )}
              {displayPicks.map((pick) => {
                const hasResult = pick.result !== undefined;
                const correct = pick.result?.correct;
                const icon = hasResult ? (correct ? '✓' : '✗') : '⏳';
                const iconColor = hasResult ? (correct ? c.win : c.loss) : c.textFaint;
                const dateLabel = pick.date
                  ? new Date(pick.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
                  : '';
                const scoreLabel = hasResult
                  ? ` · ${pick.result!.homeScore}-${pick.result!.awayScore}`
                  : '';
                return (
                  <View key={pick.id} style={[styles.pickRow, { backgroundColor: c.surface, borderBottomColor: c.borderLight }]}>
                    <View style={[styles.pickIconWrap, { borderColor: iconColor }]}>
                      <Text style={[styles.pickIcon, { color: iconColor }]}>{icon}</Text>
                    </View>
                    <View style={styles.pickRowContent}>
                      <Text style={[styles.pickTeams, { color: c.text }]} numberOfLines={1}>
                        {pick.homeTeam} – {pick.awayTeam}
                      </Text>
                      <Text style={[styles.pickMeta, { color: c.textFaint }]} numberOfLines={1}>
                        {pick.pickLabel}{scoreLabel} · {dateLabel}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {picks.length > 10 && (
                <Text style={[styles.pickMoreHint, { color: c.textFaint }]}>
                  +{picks.length - 10} daha eski tahmin
                </Text>
              )}
            </>
          );
        })()}

        {/* ── Ayarlar ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>AYARLAR</Text>
        </View>

        {/* ── Tema seçimi ── */}
        <View style={[styles.settingsCard, { backgroundColor: c.surface }]}>
          <View style={styles.notifSectionHeader}>
            <Text style={[styles.notifSectionTitle, { color: c.textMuted }]}>TEMA</Text>
          </View>
          <Text style={[styles.themeAutoHint, { color: c.textFaint }]}>
            Otomatik: 07:00-19:59 açık, 20:00-06:59 koyu
          </Text>
          <View style={styles.themeSegmentRow}>
            {([['light', '☀️ Açık'], ['system', '⚙️ Otomatik'], ['dark', '🌙 Koyu']] as const).map(([m, label]) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={[styles.themeSegmentBtn, {
                  borderColor: mode === m ? c.primary : c.border,
                  backgroundColor: mode === m ? c.primaryLight : c.surface,
                }]}>
                <Text style={[styles.themeSegmentText, { color: mode === m ? c.primary : c.textMuted, fontWeight: mode === m ? '600' : '400' }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.sectionSpacer} />

        {/* ── Bildirimler kartı ── */}
        <View style={[styles.settingsCard, { backgroundColor: c.surface }]}>
          <View style={styles.notifSectionHeader}>
            <Text style={[styles.notifSectionTitle, { color: c.textMuted }]}>BİLDİRİMLER</Text>
          </View>

          <View style={styles.settingsRow}>
            <View style={styles.notifLabelWrap}>
              <Text style={[styles.settingsLabel, { color: c.text }]}>Günlük analiz bildirimi</Text>
              <Text style={[styles.notifSub, { color: c.textFaint }]}>{'Her gün "Bugünün analizleri hazır"'}</Text>
            </View>
            <Switch
              value={notifPrefs.daily}
              onValueChange={v => togglePref('daily', v)}
              trackColor={{ false: c.border, true: c.primary }}
              thumbColor={c.surface}
            />
          </View>

          <View style={[styles.settingsDivider, { backgroundColor: c.borderLight }]} />

          <View style={styles.settingsRow}>
            <View style={styles.notifLabelWrap}>
              <Text style={[styles.settingsLabel, { color: c.text }]}>Maç hatırlatması</Text>
              <Text style={[styles.notifSub, { color: c.textFaint }]}>Favori ve takip listesi takımları, maçtan 30 dk önce</Text>
            </View>
            <Switch
              value={notifPrefs.favTeam}
              onValueChange={v => togglePref('favTeam', v)}
              trackColor={{ false: c.border, true: c.primary }}
              thumbColor={c.surface}
            />
          </View>

          <View style={[styles.settingsDivider, { backgroundColor: c.borderLight }]} />

          <View style={styles.settingsRow}>
            <View style={styles.notifLabelWrap}>
              <Text style={[styles.settingsLabel, { color: c.text }]}>Öne çıkan maçlar</Text>
              <Text style={[styles.notifSub, { color: c.textFaint }]}>Günün en yüksek puanlı maçı</Text>
            </View>
            <Switch
              value={notifPrefs.featured}
              onValueChange={v => togglePref('featured', v)}
              trackColor={{ false: c.border, true: c.primary }}
              thumbColor={c.surface}
            />
          </View>

        </View>

        <View style={styles.sectionSpacer} />

        {/* ── Diğer ayarlar ── */}
        <View style={[styles.settingsCard, { backgroundColor: c.surface }]}>
          <TouchableOpacity style={styles.settingsRow}
            onPress={() => Linking.openURL('https://twitter.com/scoutfootballhq')}>
            <Text style={[styles.settingsLabel, { color: c.text }]}>Twitter</Text>
            <Text style={[styles.settingsValue, { color: c.primary }]}>@scoutfootballhq ›</Text>
          </TouchableOpacity>

          <View style={[styles.settingsDivider, { backgroundColor: c.borderLight }]} />

          <TouchableOpacity style={styles.settingsRow}
            onPress={() => Linking.openURL('https://instagram.com/scoutfootballapp')}>
            <Text style={[styles.settingsLabel, { color: c.text }]}>Instagram</Text>
            <Text style={[styles.settingsValue, { color: c.primary }]}>@scoutfootballapp ›</Text>
          </TouchableOpacity>

          <View style={[styles.settingsDivider, { backgroundColor: c.borderLight }]} />

          <TouchableOpacity style={styles.settingsRow}
            onPress={() => Linking.openURL('https://tiktok.com/@scoutfootballapp')}>
            <Text style={[styles.settingsLabel, { color: c.text }]}>TikTok</Text>
            <Text style={[styles.settingsValue, { color: c.primary }]}>@scoutfootballapp ›</Text>
          </TouchableOpacity>

          <View style={[styles.settingsDivider, { backgroundColor: c.borderLight }]} />

          <View style={styles.settingsRow}>
            <Text style={[styles.settingsLabel, { color: c.text }]}>Versiyon</Text>
            <Text style={[styles.settingsValue, { color: c.primary }]}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
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
  container: { flex: 1 },
  topbar: { flexDirection: 'column', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 12, borderBottomWidth: 0.5 },
  topbarTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogo: { width: 42, height: 42, resizeMode: 'contain' },
  appName: { fontSize: 16, fontWeight: '600', color: '#00BAFF' },
  appNameBlue: { color: '#2563EB' },
  scroll: { flex: 1 },
  sectionSpacer: { height: 12 },
  bottomSpacer: { height: 30 },

  // Identity card
  identityCard: { flexDirection: 'row', alignItems: 'center', padding: 18, marginHorizontal: 14, borderRadius: 14, marginBottom: 8, gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#fff' },
  identityInfo: { flex: 1 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, fontSize: 18, fontWeight: '600', borderBottomWidth: 1.5, paddingBottom: 4 },
  saveBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  scoutName: { fontSize: 20, fontWeight: '700', marginBottom: 2 },
  scoutNameHint: { fontSize: 12 },

  // Section
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 20, paddingBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  sectionAction: { fontSize: 13, fontWeight: '500' },
  emptyHint: { fontSize: 13, paddingHorizontal: 14, paddingBottom: 8, textAlign: 'center', marginTop: 4 },

  // Fav team card
  addTeamBtn: { marginHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', paddingVertical: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  addTeamBtnIcon: { fontSize: 22, fontWeight: '300' },
  addTeamBtnText: { fontSize: 15, fontWeight: '500' },
  favCard: { marginHorizontal: 14, borderRadius: 14, overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
  favCardStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  favCardContent: { padding: 16, paddingLeft: 20 },
  favErrorWrap: { marginTop: 8 },
  favCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  favTeamBadge: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  favTeamBadgeText: { fontSize: 14, fontWeight: '700' },
  favTeamInfo: { flex: 1 },
  favTeamName: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 2 },
  favLeagueName: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  favStatsRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: 12, gap: 0 },
  favStatItem:     { flex: 1, alignItems: 'center' },
  favSkeletonRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: 14, marginTop: 8, gap: 0 },
  favSkeletonItem: { flex: 1, alignItems: 'center', gap: 6 },
  favSkeletonVal:  { width: '60%', height: 16, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.25)' },
  favSkeletonLbl:  { width: '45%', height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.15)' },
  favStatValue: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 3 },
  favStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '500', textAlign: 'center' },
  favStatDivider: { width: 0.5, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  formDots: { flexDirection: 'row', gap: 4, minHeight: 20, alignItems: 'center', justifyContent: 'center' },
  formDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  formDotText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  // Keep static fallback colors for StyleSheet (overridden in JSX via c.win/draw/loss)
  formWin: { backgroundColor: '#27AE60' },
  formDraw: { backgroundColor: '#888' },
  formLoss: { backgroundColor: '#C0392B' },

  // Watchlist
  watchlistItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 0.5, gap: 10 },
  watchlistDot: { width: 10, height: 10, borderRadius: 5 },
  watchlistInfo: { flex: 1 },
  watchlistName: { fontSize: 14, fontWeight: '600' },
  watchlistLeague: { fontSize: 12, marginTop: 2 },
  watchlistForm: { width: 54, minHeight: 16, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 3 },
  formDotSm: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  formDotSmText: { fontSize: 7, fontWeight: '700', color: '#fff' },
  watchlistRemove: { padding: 6 },

  // Recently viewed
  recentItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 0.5, gap: 10 },
  recentIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  recentIconText: { fontSize: 11, fontWeight: '700' },
  recentInfo: { flex: 1 },
  recentName: { fontSize: 14 },
  recentLeague: { fontSize: 11, marginTop: 1 },
  recentTime: { fontSize: 11 },

  // Settings
  settingsCard: { marginHorizontal: 14, borderRadius: 12, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  settingsLabel: { fontSize: 14 },
  settingLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  settingsValue: { fontSize: 13 },
  settingsDivider: { height: 0.5, marginLeft: 14 },
  themeSegmentRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  themeSegmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1.5 },
  themeSegmentText: { fontSize: 12 },

  // Notification settings
  notifSectionHeader: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  notifSectionTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  themeAutoHint: { fontSize: 11, paddingHorizontal: 14, paddingBottom: 10 },
  notifLabelWrap: { flex: 1, paddingRight: 12 },
  notifSub: { fontSize: 11, marginTop: 2 },
  notifHourRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  notifHourLabel: { fontSize: 14 },
  notifHourBtns: { flexDirection: 'row', gap: 8 },
  notifHourBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  notifHourBtnActive: {},
  notifHourBtnText: { fontSize: 13, fontWeight: '500' },
  notifHourBtnTextActive: { fontWeight: '600' },

  // Team picker modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, borderBottomWidth: 0.5 },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalClose: { fontSize: 15 },
  searchBox: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  searchInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  pickerLeagueHeader: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 0.5 },
  pickerLeagueTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  pickerTeamRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 0.5, gap: 12 },
  pickerTeamDot: { width: 10, height: 10, borderRadius: 5 },
  pickerTeamName: { flex: 1, fontSize: 15 },
  pickerArrow: { fontSize: 18 },
  pickerLoadingText: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, textAlign: 'center' },
  pickerBottomSpacer: { height: 40 },

  // Avatar picker modal
  avatarModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  avatarModalBox: { borderRadius: 16, padding: 24, width: 280, alignItems: 'center' },
  avatarModalTitle: { fontSize: 16, fontWeight: '600', marginBottom: 20 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 20 },
  avatarOption: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarOptionSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  avatarCheck: { fontSize: 20, color: '#fff', fontWeight: '700' },
  avatarModalCancel: { paddingVertical: 10 },
  avatarModalCancelText: { fontSize: 15 },

  // Scout Performansı
  pickAccCard: { marginHorizontal: 14, marginBottom: 10, borderRadius: 12, padding: 14 },
  pickAccTop: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 10 },
  pickAccScore: { fontSize: 26, fontWeight: '800' },
  pickAccTotal: { fontSize: 18, fontWeight: '600' },
  pickAccLabel: { fontSize: 13, flex: 1 },
  pickAccPct: { fontSize: 20, fontWeight: '800' },
  pickAccBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  pickAccBarFill: { height: 6, borderRadius: 3 },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  pickIconWrap: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  pickIcon: { fontSize: 13, fontWeight: '700' },
  pickRowContent: { flex: 1 },
  pickTeams: { fontSize: 13, fontWeight: '600' },
  pickMeta: { fontSize: 11, marginTop: 2 },
  pickMoreHint: { textAlign: 'center', fontSize: 12, paddingVertical: 8 },
});

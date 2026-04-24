import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { getSuperLigStandings, getSuperLigTeamForm, getStandings, getTeamForm } from '../services/api';
import {
  DEFAULT_PREFS, NotifPrefs, cancelAllNotifications,
  loadNotifPrefs, requestPermissions, resetScheduleDate, saveNotifPrefs,
} from '../services/notifications';

// ─── Types ────────────────────────────────────────────────────────────────────

type FavTeam = {
  name: string;
  teamId: number;
  apiId: number;
  leagueName: string;
  leagueFlag: string;
};

type RecentItem = {
  id: number;
  name: string;
  leagueName: string;
  apiId: number;
  timestamp: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE = {
  NAME: 'scout_name',
  AVATAR: 'scout_avatar',
  FAV_TEAM: 'scout_fav_team',
  WATCHLIST: 'scout_watchlist',
  RECENT: 'scout_recent',
};

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
      { name: 'Fatih Karagümrük', teamId: 138983 }, { name: 'Kasımpaşa', teamId: 0 },
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

function parseForm(matches: any[], teamId: number, isSL: boolean): string[] {
  if (isSL) {
    return matches.map(m => {
      const isHome = m.homeTeamId === teamId;
      const gf = isHome ? m.homeScore : m.awayScore;
      const ga = isHome ? m.awayScore : m.homeScore;
      return gf > ga ? 'G' : gf === ga ? 'B' : 'M';
    });
  }
  return matches
    .filter((m: any) => m.score?.fullTime?.home != null)
    .slice(-5)
    .map((m: any) => {
      const isHome = m.homeTeam?.id === teamId;
      const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away;
      const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home;
      return gf > ga ? 'G' : gf === ga ? 'B' : 'M';
    });
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

  const [watchlistForms, setWatchlistForms] = useState<Record<number, string[]>>({});
  const [watchlistStats, setWatchlistStats] = useState<Record<string, { played: number; win: number; draw: number; loss: number; gf: number; ga: number; pts: number; pos: number }>>({});
  const [recentStats, setRecentStats] = useState<Record<string, { played: number; win: number; draw: number; loss: number; gf: number; ga: number; pts: number; pos: number }>>({});

  const [teamPickerVisible, setTeamPickerVisible] = useState(false);
  const [teamPickerMode, setTeamPickerMode] = useState<'fav' | 'watchlist'>('fav');
  const [teamSearch, setTeamSearch] = useState('');
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadAll();
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
    const fav_: FavTeam | null = favRaw ? JSON.parse(favRaw) : null;
    const wl_: FavTeam[] = wlRaw ? JSON.parse(wlRaw) : [];
    const recent_: RecentItem[] = recentRaw ? JSON.parse(recentRaw) : [];

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
          s.team.toLowerCase().replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ıİ]/g, 'i')
            .includes(team.name.toLowerCase().replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ıİ]/g, 'i'))
          || team.name.toLowerCase().replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ıİ]/g, 'i')
            .includes(s.team.toLowerCase().replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ıİ]/g, 'i'))
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
    } catch {}
    setLoadingFav(false);
  }

  async function loadWatchlistForms(wl: FavTeam[]) {
    const forms: Record<number, string[]> = {};
    const stats: Record<string, { played: number; win: number; draw: number; loss: number; gf: number; ga: number; pts: number; pos: number }> = {};

    // standings: lig başına bir kez çek
    const uniqueApiIds = [...new Set(wl.map(t => t.apiId))];
    const standingsMap: Record<number, any[]> = {};
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
        const tr = (s: string) => s.toLowerCase()
          .replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
          .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ıİ]/g, 'i');
        const found = rows.find((s: any) =>
          tr(s.team || '').includes(tr(team.name)) || tr(team.name).includes(tr(s.team || ''))
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
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    setScoutName(trimmed);
    setEditingName(false);
    await AsyncStorage.setItem(STORAGE.NAME, trimmed);
  }

  async function loadRecentStats(items: RecentItem[]) {
    const tr = (s: string) => s.toLowerCase()
      .replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
      .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ıİ]/g, 'i');

    const uniqueApiIds = [...new Set(items.map(r => r.apiId))];
    const standingsMap: Record<number, any[]> = {};
    await Promise.all(
      uniqueApiIds.map(async (apiId) => {
        try {
          standingsMap[apiId] = apiId === 203
            ? await getSuperLigStandings()
            : await getStandings(apiId);
        } catch { standingsMap[apiId] = []; }
      })
    );

    const stats: Record<string, { played: number; win: number; draw: number; loss: number; gf: number; ga: number; pts: number; pos: number }> = {};
    for (const item of items) {
      const rows = standingsMap[item.apiId] || [];
      const found = rows.find((s: any) =>
        tr(s.team || '').includes(tr(item.name)) || tr(item.name).includes(tr(s.team || ''))
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
      const wl: FavTeam[] = existing ? JSON.parse(existing) : [];
      if (!wl.find(t => t.name === teamName && t.apiId === apiId)) {
        const updated = [...wl, team];
        setWatchlist(updated);
        await AsyncStorage.setItem(STORAGE.WATCHLIST, JSON.stringify(updated));
        loadWatchlistForms(updated);
      }
    }
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

  async function togglePref(key: keyof Omit<NotifPrefs, 'hour'>, val: boolean) {
    const updated = { ...notifPrefs, [key]: val };
    const anyWillBeEnabled = updated.daily || updated.favTeam || updated.featured || updated.risky;

    if (val && anyWillBeEnabled) {
      const granted = await requestPermissions();
      if (!granted) {
        Alert.alert(
          'Bildirim izni gerekli',
          'Lütfen uygulama ayarlarından bildirim iznini etkinleştirin.',
        );
        return;
      }
      await resetScheduleDate();
    }

    if (!anyWillBeEnabled) await cancelAllNotifications();

    setNotifPrefs(updated);
    await saveNotifPrefs(updated);
  }

  function goToTeamStats(team: FavTeam) {
    router.push({
      pathname: '/team_stats',
      params: {
        teamName: team.name,
        teamId: team.teamId,
        leagueName: team.leagueName,
        leagueFlag: team.leagueFlag,
        apiId: team.apiId,
        fdId: 0,
        pos: favPos, played: favPlayed, win: favWin, draw: favDraw, loss: favLoss, gf: favGf, ga: favGa, pts: favPts,
      },
    });
  }

  // ─── Team Picker Modal ──────────────────────────────────────────────────────

  const filteredLeagues = LEAGUES_TEAMS.map(lg => ({
    ...lg,
    teams: lg.teams.filter(t =>
      !teamSearch || t.name.toLowerCase().includes(teamSearch.toLowerCase())
    ),
  })).filter(lg => lg.teams.length > 0);

  function renderTeamPicker() {
    return (
      <Modal visible={teamPickerVisible} animationType="slide" onRequestClose={() => { setTeamPickerVisible(false); setTeamSearch(''); }}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {teamPickerMode === 'fav' ? 'Favori Takım Seç' : 'Takip Listesine Ekle'}
            </Text>
            <TouchableOpacity onPress={() => { setTeamPickerVisible(false); setTeamSearch(''); }}>
              <Text style={styles.modalClose}>Kapat</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Takım ara..."
              value={teamSearch}
              onChangeText={setTeamSearch}
              autoCorrect={false}
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {filteredLeagues.map(lg => (
              <View key={lg.leagueName}>
                <View style={styles.pickerLeagueHeader}>
                  <Text style={styles.pickerLeagueTitle}>{lg.flag} {lg.leagueName}</Text>
                </View>
                {lg.teams.map(t => (
                  <TouchableOpacity key={t.name} style={styles.pickerTeamRow}
                    onPress={() => selectTeam(lg.flag, lg.leagueName, lg.apiId, t.name, t.teamId)}>
                    <View style={[styles.pickerTeamDot, { backgroundColor: getTeamColors(t.name).p }]} />
                    <Text style={styles.pickerTeamName}>{t.name}</Text>
                    <Text style={styles.pickerArrow}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <View style={{ height: 40 }} />
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
          <View style={styles.avatarModalBox}>
            <Text style={styles.avatarModalTitle}>Renk Seç</Text>
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
              <Text style={styles.avatarModalCancelText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const avatarColor = AVATAR_COLORS[avatarIdx] || '#185FA5';
  const avatarLabel = scoutName ? scoutName.trim().slice(0, 2).toUpperCase() : '?';
  const favColors = favTeam ? getTeamColors(favTeam.name) : { p: '#185FA5', s: '#0C447C' };

  return (
    <View style={styles.container}>
      {renderTeamPicker()}
      {renderAvatarPicker()}

      {/* Top Bar */}
      <View style={styles.topbar}>
        <View style={{ width: 60 }} />
        <Text style={styles.topbarTitle}>Scout Rozeti</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Scout Kimlik Kartı ── */}
        <View style={styles.identityCard}>
          <TouchableOpacity style={[styles.avatar, { backgroundColor: avatarColor }]}
            onPress={() => setAvatarPickerVisible(true)}>
            <Text style={styles.avatarText}>{avatarLabel}</Text>
          </TouchableOpacity>
          <View style={styles.identityInfo}>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={styles.nameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Scout adın..."
                  autoFocus
                  onSubmitEditing={saveName}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={saveName}>
                  <Text style={styles.saveBtnText}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { setNameInput(scoutName); setEditingName(true); }}>
                <Text style={styles.scoutName}>{scoutName || 'Adın ne olsun?'}</Text>
                <Text style={styles.scoutNameHint}>Düzenlemek için dokun</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Favori Takım ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>FAVORİ TAKIM</Text>
          {favTeam && (
            <TouchableOpacity onPress={removeFavTeam}>
              <Text style={styles.sectionAction}>Kaldır</Text>
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
                  <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
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
                              r === 'G' ? styles.formWin : r === 'B' ? styles.formDraw : styles.formLoss]}>
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
          <TouchableOpacity style={styles.addTeamBtn}
            onPress={() => { setTeamPickerMode('fav'); setTeamPickerVisible(true); }}>
            <Text style={styles.addTeamBtnIcon}>+</Text>
            <Text style={styles.addTeamBtnText}>Favori takımını seç</Text>
          </TouchableOpacity>
        )}

        {/* ── Takip Listesi ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>TAKİP LİSTESİ</Text>
          <TouchableOpacity onPress={() => { setTeamPickerMode('watchlist'); setTeamPickerVisible(true); }}>
            <Text style={styles.sectionAction}>+ Ekle</Text>
          </TouchableOpacity>
        </View>

        {watchlist.length === 0 ? (
          <Text style={styles.emptyHint}>İzlemek istediğin takımları buraya ekle.</Text>
        ) : (
          watchlist.map((team) => {
            const wColors = getTeamColors(team.name);
            const wForm = watchlistForms[team.teamId] || [];
            const wStats = watchlistStats[team.name];
            return (
              <TouchableOpacity key={team.name} style={styles.watchlistItem}
                onPress={() => router.push({ pathname: '/team_stats', params: { teamName: team.name, teamId: team.teamId, leagueName: team.leagueName, leagueFlag: team.leagueFlag, apiId: team.apiId, fdId: 0, pos: wStats?.pos ?? 0, played: wStats?.played ?? 0, win: wStats?.win ?? 0, draw: wStats?.draw ?? 0, loss: wStats?.loss ?? 0, gf: wStats?.gf ?? 0, ga: wStats?.ga ?? 0, pts: wStats?.pts ?? 0 } })}>
                <View style={[styles.watchlistDot, { backgroundColor: wColors.p }]} />
                <View style={styles.watchlistInfo}>
                  <Text style={styles.watchlistName}>{team.name}</Text>
                  <Text style={styles.watchlistLeague}>{team.leagueFlag} {team.leagueName}</Text>
                </View>
                {wForm.length > 0 && (
                  <View style={styles.watchlistForm}>
                    {wForm.map((r, i) => (
                      <View key={i} style={[styles.formDotSm,
                        r === 'G' ? styles.formWin : r === 'B' ? styles.formDraw : styles.formLoss]}>
                        <Text style={styles.formDotSmText}>{r}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={styles.watchlistRemove}
                  onPress={() => removeWatchlistItem(team.name)}>
                  <Text style={styles.watchlistRemoveText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}

        {/* ── Son Bakılanlar ── */}
        {recentlyViewed.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>SON BAKILANLAR</Text>
              <TouchableOpacity onPress={async () => {
                await AsyncStorage.removeItem(STORAGE.RECENT);
                setRecentlyViewed([]);
              }}>
                <Text style={styles.sectionAction}>Temizle</Text>
              </TouchableOpacity>
            </View>
            {recentlyViewed.slice(0, 8).map((item, i) => {
              const rStats = recentStats[item.name];
              return (
              <TouchableOpacity key={i} style={styles.recentItem}
                onPress={() => router.push({ pathname: '/team_stats', params: { teamName: item.name, teamId: item.id, leagueName: item.leagueName, leagueFlag: '', apiId: item.apiId, fdId: 0, pos: rStats?.pos ?? 0, played: rStats?.played ?? 0, win: rStats?.win ?? 0, draw: rStats?.draw ?? 0, loss: rStats?.loss ?? 0, gf: rStats?.gf ?? 0, ga: rStats?.ga ?? 0, pts: rStats?.pts ?? 0 } })}>
                <View style={styles.recentIcon}>
                  <Text style={styles.recentIconText}>
                    {item.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentName}>{item.name}</Text>
                  <Text style={styles.recentLeague}>{item.leagueName}</Text>
                </View>
                <Text style={styles.recentTime}>{timeAgo(item.timestamp)}</Text>
              </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── Ayarlar ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>AYARLAR</Text>
        </View>

        {/* ── Bildirimler kartı ── */}
        <View style={styles.settingsCard}>
          <View style={styles.notifSectionHeader}>
            <Text style={styles.notifSectionTitle}>BİLDİRİMLER</Text>
          </View>

          <View style={styles.settingsRow}>
            <View style={styles.notifLabelWrap}>
              <Text style={styles.settingsLabel}>Günlük analiz bildirimi</Text>
              <Text style={styles.notifSub}>Her gün "Bugünün analizleri hazır"</Text>
            </View>
            <Switch
              value={notifPrefs.daily}
              onValueChange={v => togglePref('daily', v)}
              trackColor={{ false: '#e0e0e0', true: '#185FA5' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingsDivider} />

          <View style={styles.settingsRow}>
            <View style={styles.notifLabelWrap}>
              <Text style={styles.settingsLabel}>Favori takım bildirimleri</Text>
              <Text style={styles.notifSub}>Favori takımın oynayacağı günler</Text>
            </View>
            <Switch
              value={notifPrefs.favTeam}
              onValueChange={v => togglePref('favTeam', v)}
              trackColor={{ false: '#e0e0e0', true: '#185FA5' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingsDivider} />

          <View style={styles.settingsRow}>
            <View style={styles.notifLabelWrap}>
              <Text style={styles.settingsLabel}>Öne çıkan maçlar</Text>
              <Text style={styles.notifSub}>Günün en yüksek puanlı maçı</Text>
            </View>
            <Switch
              value={notifPrefs.featured}
              onValueChange={v => togglePref('featured', v)}
              trackColor={{ false: '#e0e0e0', true: '#185FA5' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingsDivider} />

          <View style={styles.settingsRow}>
            <View style={styles.notifLabelWrap}>
              <Text style={styles.settingsLabel}>Riskli maç uyarıları</Text>
              <Text style={styles.notifSub}>Sürpriz senaryoya açık maçlar</Text>
            </View>
            <Switch
              value={notifPrefs.risky}
              onValueChange={v => togglePref('risky', v)}
              trackColor={{ false: '#e0e0e0', true: '#185FA5' }}
              thumbColor="#fff"
            />
          </View>

        </View>

        <View style={{ height: 12 }} />

        {/* ── Diğer ayarlar ── */}
        <View style={styles.settingsCard}>
          <TouchableOpacity style={styles.settingsRow}
            onPress={() => Linking.openURL('https://twitter.com/scoutfootballhq')}>
            <Text style={styles.settingsLabel}>Twitter</Text>
            <Text style={styles.settingsValue}>@scoutfootballhq ›</Text>
          </TouchableOpacity>

          <View style={styles.settingsDivider} />

          <TouchableOpacity style={styles.settingsRow}
            onPress={() => Linking.openURL('https://instagram.com/scoutfootballapp')}>
            <Text style={styles.settingsLabel}>Instagram</Text>
            <Text style={styles.settingsValue}>@scoutfootballapp ›</Text>
          </TouchableOpacity>

          <View style={styles.settingsDivider} />

          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Versiyon</Text>
            <Text style={styles.settingsValue}>1.0.0</Text>
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Tab Bar ── */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/')}>
          <Text style={styles.tabText}>Maçlar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/leagues')}>
          <Text style={styles.tabText}>Ligler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/stats')}>
          <Text style={styles.tabText}>İstatistik</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab}>
          <Text style={[styles.tabText, styles.tabActive]}>Profil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  topbarTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  scroll: { flex: 1 },

  // Identity card
  identityCard: { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', padding: 18, marginBottom: 8, gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#fff' },
  identityInfo: { flex: 1 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, fontSize: 18, fontWeight: '600', color: '#111', borderBottomWidth: 1.5, borderBottomColor: '#185FA5', paddingBottom: 4 },
  saveBtn: { backgroundColor: '#185FA5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  scoutName: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 2 },
  scoutNameHint: { fontSize: 12, color: '#aaa' },

  // Section
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 20, paddingBottom: 8 },
  sectionLabel: { fontSize: 11, color: '#888', fontWeight: '700', letterSpacing: 0.6 },
  sectionAction: { fontSize: 13, color: '#185FA5', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#aaa', paddingHorizontal: 14, paddingBottom: 8, textAlign: 'center', marginTop: 4 },

  // Fav team card
  addTeamBtn: { marginHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#185FA5', borderStyle: 'dashed', paddingVertical: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  addTeamBtnIcon: { fontSize: 22, color: '#185FA5', fontWeight: '300' },
  addTeamBtnText: { fontSize: 15, color: '#185FA5', fontWeight: '500' },
  favCard: { marginHorizontal: 14, borderRadius: 14, overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
  favCardStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  favCardContent: { padding: 16, paddingLeft: 20 },
  favCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  favTeamBadge: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  favTeamBadgeText: { fontSize: 14, fontWeight: '700' },
  favTeamInfo: { flex: 1 },
  favTeamName: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 2 },
  favLeagueName: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  favStatsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: 12, gap: 0 },
  favStatItem: { flex: 1, alignItems: 'center' },
  favStatValue: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 3 },
  favStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '500', textAlign: 'center' },
  favStatDivider: { width: 0.5, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  formDots: { flexDirection: 'row', gap: 4 },
  formDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  formDotText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  formWin: { backgroundColor: '#27AE60' },
  formDraw: { backgroundColor: '#888' },
  formLoss: { backgroundColor: '#C0392B' },

  // Watchlist
  watchlistItem: { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0', gap: 10 },
  watchlistDot: { width: 10, height: 10, borderRadius: 5 },
  watchlistInfo: { flex: 1 },
  watchlistName: { fontSize: 14, fontWeight: '600', color: '#111' },
  watchlistLeague: { fontSize: 12, color: '#888', marginTop: 2 },
  watchlistForm: { flexDirection: 'row', gap: 3 },
  formDotSm: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  formDotSmText: { fontSize: 7, fontWeight: '700', color: '#fff' },
  watchlistRemove: { padding: 6 },
  watchlistRemoveText: { fontSize: 14, color: '#ccc' },

  // Recently viewed
  recentItem: { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0', gap: 10 },
  recentIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#E6F1FB', alignItems: 'center', justifyContent: 'center' },
  recentIconText: { fontSize: 11, fontWeight: '700', color: '#0C447C' },
  recentInfo: { flex: 1 },
  recentName: { fontSize: 14, color: '#111' },
  recentLeague: { fontSize: 11, color: '#888', marginTop: 1 },
  recentTime: { fontSize: 11, color: '#bbb' },

  // Settings
  settingsCard: { backgroundColor: '#fff', marginHorizontal: 14, borderRadius: 12, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  settingsLabel: { fontSize: 14, color: '#111' },
  settingsValue: { fontSize: 13, color: '#185FA5' },
  settingsDivider: { height: 0.5, backgroundColor: '#f0f0f0', marginLeft: 14 },

  // Notification settings
  notifSectionHeader: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  notifSectionTitle: { fontSize: 11, color: '#888', fontWeight: '700', letterSpacing: 0.6 },
  notifLabelWrap: { flex: 1, paddingRight: 12 },
  notifSub: { fontSize: 11, color: '#aaa', marginTop: 2 },
  notifHourRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  notifHourLabel: { fontSize: 14, color: '#111' },
  notifHourBtns: { flexDirection: 'row', gap: 8 },
  notifHourBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f8f8f8' },
  notifHourBtnActive: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  notifHourBtnText: { fontSize: 13, color: '#555', fontWeight: '500' },
  notifHourBtnTextActive: { color: '#fff', fontWeight: '600' },

  // Tab bar
  tabBar: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#eee', paddingBottom: 20, backgroundColor: '#fff' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 12, color: '#888' },
  tabActive: { color: '#185FA5', fontWeight: '500' },

  // Team picker modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#111' },
  modalClose: { fontSize: 15, color: '#185FA5' },
  searchBox: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  searchInput: { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111' },
  pickerLeagueHeader: { backgroundColor: '#f8f8f8', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  pickerLeagueTitle: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.5 },
  pickerTeamRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#f5f5f5', gap: 12 },
  pickerTeamDot: { width: 10, height: 10, borderRadius: 5 },
  pickerTeamName: { flex: 1, fontSize: 15, color: '#111' },
  pickerArrow: { fontSize: 18, color: '#ccc' },

  // Avatar picker modal
  avatarModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  avatarModalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 280, alignItems: 'center' },
  avatarModalTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 20 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 20 },
  avatarOption: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarOptionSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  avatarCheck: { fontSize: 20, color: '#fff', fontWeight: '700' },
  avatarModalCancel: { paddingVertical: 10 },
  avatarModalCancelText: { fontSize: 15, color: '#888' },
});

# ScoutFootball — CLAUDE.md

## Güncel Durum Notları (2026-05-07)

- Railway backend artık ana GitHub reposuna bağlı: `umuttnurayy-beep/Scout-Football`, branch `main`, root directory `/ScoutFootball-Backend`.
- Ayrık `ScoutFootball-Backend` reposu eski deploy kaynağı olarak kalabilir; aktif deploy akışı ana repo üzerinden yürümelidir.
- Railway production variables: `ALLSPORTS_KEY`, `FOOTBALL_DATA_KEY`, `MONGODB_URI`, `ODDS_API_KEY`, `RAPID_API_KEY`, `WEATHER_KEY`.
- `WEATHER_API_KEY` Railway build secret hatası verdiği için kullanılmıyor; backend `WEATHER_KEY` okur.
- Push token kaydı aktif: Expo `projectId` app config içinde, `/register-token` MongoDB `PushToken` koleksiyonuna yazar, `/push/status` ile kontrol edilir.
- EAS project ID: `82f6a1df-704f-4f50-b813-3bc9b2e33e4e`.
- iOS bundle id ve Android package: `com.umutnuray.scoutfootball`.
- OTA update hazırlığı yapıldı: `expo-updates`, `updates.url`, `runtimeVersion.policy = appVersion`, EAS production channel `production`.
- Ana ekran `getHomeData(date)` ile tek payload üzerinden beslenir. Tarih değişiminde önce AsyncStorage home cache gösterilir, ardından taze veri arka planda yenilenir; kullanıcıya "son cache" uyarısı basılmaz.
- Ana ekrandan maç detayına geçişte maç context preload sessizdir. Arka plan `getMatchContext`/H2H/ikincil veri hataları sayfa zaten çizilebiliyorsa toast olarak gösterilmez.
- Günün maçı backend `featuredMatchId` ile gelir ve frontend'de tarih bazlı cache'lenir; bir tarih için seçilen günün maçı sonradan değişmemelidir.
- Analiz metinleri tek karar hattından beslenir: `buildScoutPick` karar üretir, ana kart kısa yorumu `cardComment`, Scout Özeti `buildScoutSummaryFromPick`, Pick açıklaması `detail` alanını kullanır.
- Scout Özeti veri raporu değil analist yorumu gibi yazılmalıdır: sayı kalabalığı yerine hücum-savunma eşleşmesi, form etkisi, saha/deplasman dengesi, gol senaryosu ve risk yorumu öne alınmalı; detaylı sayılar "Neden? / gerekçeler" ve alt bölümlerde kalmalıdır.
- Radar grafikte sağ/sol yatay etiketler kırpılmayacak şekilde anchor'lanır; çapraz etiketler kendi eksen noktasında ortalı kalmalıdır (`components/RadarChart.tsx`).
- **Push notification altyapısı kuruldu** (`services/notifications.ts`): `NotifPrefs` (daily/favTeam/featured), `scheduleNotifications`, `registerPushToken`, `cancelAllNotifications` fonksiyonları aktif. Profile'daki toggle artık sadece flag değil, gerçek bildirim zamanlıyor.
- **Tema sistemi aktif** (`context/ThemeContext.tsx`): Light / Dark / System modu. System modunda saat 07:00–20:00 arası açık, dışarısı koyu tema. Her bileşen `useTheme()` hook'u ile tema renklerine erişir.
- UCL bracket `groupTies()` tamamen dinamik: hardcoded takım/maç ID'si yok. API verisi doğru gelirse bracket otomatik çalışır; takımlar henüz belirlenmemişse her maç ayrı "TBD" turu olarak gösterilir.
- **Backend context warming aktif** (`app.js` → `warmHomeMatchContexts`): `/home` yanıtı dönerken featured maç öncelikli olmak üzere en fazla **6 maç** context'i paralel olarak arka planda MongoDB cache'e ısıtılır (`scheduleContextWarmup` fire-and-forget). Splash ekran görünürken bu ısıtma çalışır; kullanıcı detay sayfasına açtığında cache genellikle hazır olur.


## Build ve Submit Notları

- Production build komutu: `eas build --profile production --platform all --auto-submit`.
- `app.json`: `ios.bundleIdentifier`, `ios.buildNumber`, `android.package`, `android.versionCode`, `updates.url`, `runtimeVersion` tanımlı.
- `eas.json`: production `channel=production`, Android `buildType=app-bundle`, `autoIncrement=true`, submit Android `track=internal`.
- Auto-submit için EAS/Store tarafında Android Play service account ve iOS App Store Connect uygulama kaydı/credential kurulumu gerekebilir; boş `ascAppId` veya `appleTeamId` değerleri `eas.json`a yazılmaz.

Türkçe konuşan bir geliştirici tarafından inşa edilen, futbol maç takibi ve bahis analizi yapan mobil uygulama.

---

## Proje Yapısı

```
ScoutFootball/                    ← React Native + Expo (frontend)
├── app/
│   ├── _layout.tsx               ← Expo Router kök layout (Stack) + ThemeProvider
│   ├── index.tsx                 ← Ana ekran — günlük maçlar + Scout modu
│   ├── match_detail.tsx          ← Maç detay (tek-scroll analiz sayfası)
│   ├── sl_match_detail.tsx       ← Süper Lig maç detayı (TheSportsDB timeline)
│   ├── leagues.tsx               ← Lig paneli (4 alt sekme) + UCL bracket
│   ├── stats.tsx                 ← İstatistik lig seçim ekranı
│   ├── team_detail.tsx           ← Lig takım listesi (A–Z)
│   ├── team_stats.tsx            ← Takım istatistik detayı (2 sekme)
│   └── profile.tsx               ← Scout rozeti: favori + takip listesi + ayarlar
├── components/
│   ├── BottomTabBar.tsx          ← Alt navigasyon (Maçlar|Ligler|İstatistik|Profil)
│   ├── CompareRow.tsx            ← İki takım karşılaştırma satırı
│   ├── DetailDataState.tsx       ← Detay sayfası veri durumu/uyarı bileşenleri
│   ├── EmptyStateCard.tsx        ← Boş veri durumu kartı
│   ├── FormHeatRow.tsx           ← Form ısı haritası satırı
│   ├── RadarChart.tsx            ← 5 eksenli SVG radar grafik
│   ├── RefreshStatusBar.tsx      ← Yenileme durum çubuğu
│   ├── SkeletonLoader.tsx        ← Yükleme skeleton bileşenleri
│   ├── ShotGauge.tsx             ← Şut göstergesi
│   └── TieCard.tsx               ← UCL eşleşme kartı
├── context/
│   └── ThemeContext.tsx          ← Light/Dark/System tema bağlamı
├── constants/
│   ├── colors.ts                 ← lightColors / darkColors (ThemeColors type)
│   └── seasons.ts                ← CURRENT_FOOTBALL_SEASON, DISPLAY_FOOTBALL_SEASON
├── services/
│   ├── api.ts                    ← Tüm backend çağrıları
│   ├── apiNormalizers.ts         ← Payload normalizer yardımcıları (arrayOrEmpty, standingsMapOrEmpty vb.)
│   ├── apiResponse.ts            ← API yanıt yardımcıları (logApiError, readApiJson, isStaleApiData)
│   ├── config.ts                 ← API_BASE_URL sabiti
│   ├── notifications.ts          ← Push bildirim altyapısı (expo-notifications)
│   ├── oddsMatching.ts           ← Oran maç eşleştirme mantığı
│   └── oddsMatching.debug.ts     ← Oran eşleştirme debug yardımcıları
└── utils/
    ├── emptyStates.ts            ← Boş durum mesajları
    ├── leagueAnalysis.ts         ← Lig analizi, UCL bracket, takım etiketleri
    ├── matchAnalysis.ts          ← buildScoutPick, buildScoutSummaryFromPick, buildMatchAnalysis
    ├── matchDetailDataState.ts   ← Detay sayfası veri durumu hesaplama
    ├── matchMetrics.ts           ← computeMetrics, scoutScore, buildHomeCardAnalysis vb.
    ├── matchTextBanks.ts         ← SHORT_BANK / MEDIUM_BANK metin havuzları
    ├── profileStorage.ts         ← FavTeam, RecentItem parser yardımcıları
    ├── scoutHelpText.ts          ← Scout yardım metinleri (SCOUT_HELP map)
    ├── scoutStyles.ts            ← Paylaşılan stil sabitleri
    ├── spacing.ts                ← Boşluk sabitleri
    ├── teamStats.ts              ← calcSLSeasonStats, calcSeasonStats, getTeamProfile, parseForm, transliterate
    └── timedCache.ts             ← readTimedCache / writeTimedCache AsyncStorage yardımcıları

ScoutFootball-Backend/            ← Node.js + Express (backend)
├── server.js                     ← start entrypoint
├── app.js                        ← Express app + route wiring
├── routes/                       ← Endpoint modülleri
├── services/                     ← Veri kaynakları/cache/context servisleri
└── models/                       ← MongoDB modelleri
```

---

## Tech Stack

| Katman | Teknoloji |
|---|---|
| Frontend | React Native + Expo SDK, expo-router (file-based routing) |
| Dil | TypeScript (frontend) + JavaScript (backend) |
| Backend | Node.js + Express |
| Deployment | Railway (GitHub push → otomatik deploy) |
| Önbellek | MongoDB (Railway eklentisi) + RAM fallback |
| Tema | Context API + AsyncStorage (light/dark/system) |
| Bildirimler | expo-notifications (local scheduling + push token kaydı) |
| Test | Expo Go (fiziksel telefon) |
| Hedef | Google Play Store |

---

## Backend

**URL:** `https://scoutfootball-backend-production.up.railway.app`

**GitHub:** `umuttnurayy-beep/Scout-Football` (branch: `main`, root directory: `/ScoutFootball-Backend`)

Railway, ana repo `main` branch'ine push gelince `/ScoutFootball-Backend` klasöründen otomatik deploy eder. Deploy genelde 1-2 dakika sürer.

### Ortam Değişkenleri (Railway)

| Değişken | Kaynak |
|---|---|
| `FOOTBALL_DATA_KEY` | football-data.org |
| `WEATHER_KEY` | WeatherAPI.com |
| `ODDS_API_KEY` | The Odds API |
| `THESPORTSDB_KEY` | TheSportsDB (Süper Lig — ücretsiz plan için `3` veya premium key) |
| `MONGODB_URI` | Railway MongoDB eklentisi |
| `RAPID_API_KEY` | API-Football / RapidAPI |
| `ALLSPORTS_KEY` | AllSports API (korner + possession için) |

> `RAPID_API_KEY` boş veya upstream erişimi sorunlu olduğunda `/af/` endpoint'leri boş array/null döner ve frontend sessiz fallback yapar.
>
> Eski `COLLECT_API_KEY` artık kullanılmıyor — Süper Lig entegrasyonu TheSportsDB'ye taşındı.

### Önbellekleme

MongoDB önce, RAM fallback. Boş sonuçlar **önbelleklenmez** (standings hariç eski davranış — v3 cache key ile düzeltildi).

| Veri | TTL |
|---|---|
| Canlı maçlar | 30 saniye |
| Maç listesi | 60 saniye |
| Puan tablosu | 1 saat |
| Gol krallığı | 1 saat |
| H2H | 1 saat |
| Hava durumu | 10 dakika |
| Oranlar (frontend) | 30 dakika |
| Takım kadrosu | 24 saat |
| Takım istatistikleri (AF) | 6 saat |
| Lig takımları (AF) | 7 gün |

---

## API Veri Kaynakları

### football-data.org (Ücretsiz Plan)
- Ücretsiz plan yalnızca **Premier Lig, La Liga, Bundesliga** puan tablolarını kapsar.
- Serie A, Ligue 1, UCL için puan tablosu **erişimi yok** → ESPN fallback devreye girer.
- Maç listesi (`/matches`), H2H, takım kadrosu ve gol krallığı tüm desteklenen ligler için çalışır.
- Rate limit: 10 istek/dakika.

### ESPN Public API (Ücretsiz, Anonim)
Serie A, Ligue 1 ve UCL puan tabloları için otomatik fallback.

| Lig | ESPN Slug |
|---|---|
| Serie A | `ita.1` |
| Ligue 1 | `fra.1` |
| UCL | `uefa.champions` |

Endpoint: `https://site.api.espn.com/apis/v2/sports/soccer/{slug}/standings`
Yanıt yolu: `children[0].standings.entries[]`
Stat isimleri: `gamesPlayed`, `wins`, `ties`, `losses`, `pointsFor`, `pointsAgainst`, `points`

> ESPN'den gelen takımlarda `teamId: 0` olur (ESPN ID'leri football-data.org ile eşleşmez).

### TheSportsDB (Süper Lig)
Süper Lig verisi **TheSportsDB** üzerinden çekiliyor (eski CollectAPI tabanlı entegrasyon terk edildi).
TheSportsDB takım ID'leri frontend'de hard-coded (bkz. `profile.tsx` → `LEAGUES_TEAMS`).

| Endpoint | Backend Rotası | Açıklama |
|---|---|---|
| League standings | `GET /superlig/standings` | Puan tablosu |
| League events (by date) | `GET /superlig/matches?date=YYYY-MM-DD` | Tarihe göre maç listesi |
| Team season events | `GET /superlig/team-form/:teamId` | Takımın mevcut sezon maçları (form + iç/dış saha hesabı için) |
| Team players | `GET /superlig/players/:teamId` | Takım kadrosu |
| League scorers | `GET /superlig/scorers` | Gol krallığı (lig geneli) |
| Match detail + context | `GET /superlig/match/:eventId/context` | Maç context'i (form + H2H + event) |
| Team context | `GET /superlig/team-context/:teamId` | Takım form + standings context |

Süper Lig maç verileri `{ id, home, away, homeScore, awayScore, date, time, status, homeTeamId, awayTeamId }` formatında gelir. Gol krallığı `{ name, goals, team }` — artık takım bilgisi **var**, isim bazlı filtreleme yapılabiliyor.

**Sponsor temizleme:** Takım adlarındaki sponsor önekleri (`cleanSLName()` ile) kaldırılır.
Örnek: `"Hesap.com Antalyaspor"` → `"Antalyaspor"`, `"ikas Eyüpspor"` → `"Eyüpspor"`

`SL_BASE_NAMES` listesine yeni bir Süper Lig takımı eklendiğinde buraya da eklenmeli.

**Hard-coded TheSportsDB takım ID'leri** (`profile.tsx` içinde):
Galatasaray 133804, Fenerbahçe 133807, Beşiktaş 133794, Trabzonspor 133796, Başakşehir 134589,
Samsunspor 133797, Göztepe 135891, Çaykur Rizespor 133885, Konyaspor 133835, Gaziantep FK 138092,
Kocaelispor 133870, Alanyaspor 135676, Antalyaspor 133799, Gençlerbirliği 133798,
Eyüpspor 138977, Kayserispor 133802, Fatih Karagümrük 138983, Kasımpaşa 133834.

### API-Football (RapidAPI) — Kısmen Aktif
`RAPID_API_KEY` ayarlanmadığından tüm `/af/` endpoint'leri boş döner. Ancak frontend kodu bu endpoint'lere çağrı yapar; sessizce fallback yapar.
- `getAfLeagueTeams(leagueId, season)` — lig takım listesi
- `getAfTeamStats(leagueId, teamId, season)` — detaylı takım istatistikleri
- `getAfTopScorers(leagueId, season)` — gol krallığı (asist dahil)
- `getAfTopAssists(leagueId, season)` — asist krallığı
- `getAfSquad(afTeamId)` — kadro

### The Odds API
Bahis oranları için. `match_detail.tsx` içindeki `getOddsComment()` yorumu bu veriyi tüketir (sekme yok — analiz metnine gömülür).
`ODDS_LEAGUE_MAP` ile fdId → spor kodu eşleşmesi yapılır. Frontend odds cache TTL: 30 dakika.

### WeatherAPI
`match_detail.tsx` → **HAVA ETKİSİ** bölümünde gösterilir.
`getCityForTeam(teamName)` fonksiyonu (`services/api.ts` içindeki `TEAM_CITIES` map'inden) takım adından şehir çıkarır.

---

## Lig ID Eşleştirme

| Lig | `apiId` (football-data.org) | `fdId` | ESPN Slug | Süper Lig kaynağı |
|---|---|---|---|---|
| Premier Lig | 39 | 2021 | — | — |
| La Liga | 140 | 2014 | — | — |
| Bundesliga | 78 | 2002 | — | — |
| Serie A | 135 | 2019 | `ita.1` | — |
| Ligue 1 | 61 | 2015 | `fra.1` | — |
| UCL | 2 | 2001 | `uefa.champions` | — |
| Süper Lig | 203 | 0 | — | TheSportsDB (takım başına ID) |

> `apiId`, football-data.org'un **competition ID**'sidir. `fdId` aynı değerin frontend'deki takma adıdır. `services/api.ts` içindeki `LEAGUE_MAP`, `apiId → fdId` dönüşümünü yapar.
>
> Süper Lig için `teamId` artık TheSportsDB takım ID'sidir (ör. Galatasaray 133804). Form geçmişi ve oyuncu kadrosu Süper Lig için de çalışır. football-data.org / API-Football'a bağlı özellikler (`/team/:teamId`, `/af/*`) bu ligde yine devre dışıdır.

---

## Backend Endpoint'leri (`ScoutFootball-Backend`)

Backend entrypoint `server.js`, Express uygulama kurulumu ve route wiring ise `app.js` ve `routes/` altındadır. Eski notlarda "tüm endpoint'ler server.js içinde" deniyordu; artık doğru kabul edilmemeli.

### Football-data.org Kökenli

| Method | Path | Açıklama | Cache Key |
|---|---|---|---|
| GET | `/standings/:leagueId` | Puan tablosu (ESPN fallback ile) | `standings_v3_{id}` |
| GET | `/matches?date=` | Günlük maçlar | `matches_{date}` |
| GET | `/home?date=` | Ana ekran birleşik payload'i (maçlar + SL + standings + featured + preview) | home/date cache |
| GET | `/match/:matchId` | Maç detay | `match_{id}` |
| GET | `/match/:matchId/context?finished=1` | Maç detay context'i (match + form + H2H + issue listesi) | context cache |
| GET | `/h2h/:matchId` | H2H geçmişi | `h2h_{id}` |
| GET | `/team/:teamId` | Takım + kadro | `team_{id}` |
| GET | `/team/:teamId/matches` | Takım mevcut sezon maçları | `team_matches_season_v2_{id}` |
| GET | `/scorers/:leagueId` | Gol krallığı | `scorers_{id}` |

### Hava + Oranlar

| Method | Path | Açıklama |
|---|---|---|
| GET | `/weather?city=` | Hava durumu |
| GET | `/odds?sport=` | Bahis oranları |

### API-Football (RapidAPI) — `/af/` prefix

| Method | Path | Açıklama |
|---|---|---|
| GET | `/af/league-teams/:leagueId?season=` | Lig takım listesi + AF ID'leri |
| GET | `/af/team-stats/:leagueId/:teamId?season=` | Takım istatistikleri |
| GET | `/af/topscorers/:leagueId?season=` | Gol krallığı |
| GET | `/af/topassists/:leagueId?season=` | Asist krallığı |
| GET | `/af/squad/:teamId` | Kadro |
| GET | `/af/fixture-stats/:fixtureId` | Maç istatistikleri |
| GET | `/af/fixture-players/:fixtureId` | Maç oyuncu performansları |
| GET | `/af/fixture/:fixtureId` | Maç detayı (lineup + events) |

### Süper Lig (TheSportsDB)

| Method | Path | Açıklama |
|---|---|---|
| GET | `/superlig/standings` | Puan tablosu |
| GET | `/superlig/matches?date=YYYY-MM-DD` | Tarihe göre Süper Lig maçları (ana ekranda kullanılır) |
| GET | `/superlig/team-form/:teamId` | Takımın mevcut sezon maçları (form + sezon analizi için) |
| GET | `/superlig/players/:teamId` | Takım kadrosu |
| GET | `/superlig/scorers` | Gol krallığı (lig geneli) |
| GET | `/superlig/match/:eventId` | Maç detayı (gol/kart timeline, `sl_match_detail.tsx` için) |
| GET | `/superlig/match/:eventId/context` | Maç context'i (event + homeContext + awayContext + H2H) |
| GET | `/superlig/team-context/:teamId` | Takım bağlamı (form maçları + standings) |

### SportsDB — Avrupa Ligleri (Europa + Conference)

| Method | Path | Açıklama |
|---|---|---|
| GET | `/sportsdb/league/:leagueId/matches?date=` | Tarihe göre maç listesi (Europa/Conference) |
| GET | `/sportsdb/team-form/:leagueId/:teamId` | Takımın mevcut sezon form maçları |
| GET | `/sportsdb/standings/:leagueId` | Puan tablosu |
| GET | `/sportsdb/match/:eventId` | Maç detayı (`sl_match_detail.tsx` ile paylaşımlı) |

### AllSports (korner + possession)

| Method | Path | Açıklama |
|---|---|---|
| GET | `/allsports/team-stats/:teamName` | Takım adına göre korner ve top hakimiyeti verileri |
| GET | `/allsports/h2h?home=&away=` | İki takım arasında H2H korner/possession verileri |

### Diğer

| Method | Path | Açıklama |
|---|---|---|
| GET | `/ucl/knockouts?season=` | UCL eleme eşleşmeleri |
| GET | `/health` | Backend sağlık kontrolü |
| POST | `/register-token` | Push token kaydı (MongoDB PushToken) |
| GET | `/push/status` | Push token durumu |

---

## Frontend Ekranları

### `app/index.tsx` — Ana Ekran
- Tarih seridi (±3 gün), lig filtreleri + **"Scout"** varsayılan filtresi.
- Ana veri akışı `getHomeData(dateStr)` üzerinden gelir. Backend payload'i maçlar, Süper Lig maçları, standings, `featuredMatchId`, `nextPreview` ve `sourceWarnings` alanlarını birlikte taşır.
- `loadMatches(date, silent)` cache-first çalışır: önce `scout_home_data_cache_v1:{date}` okunur ve ekrana basılır, sonra taze `/home` verisi arka planda yenilenir. Kullanıcıya cache uyarısı gösterilmez.
- `applyHomeData()` Süper Lig + ana ligleri birleştirir, kısmi upstream sorunlarında son iyi görünen veriyi korumaya çalışır.
- `hydratePartialHomeData()` ana maç kaynağı geçici eksikse aynı tarihin cache'inden eksik ana maçları tamamlar.
- Ana ekrandan detaya geçişte `preloadMatchContext(id, finished, { silent: true })` çalışır. Bu sadece hız içindir; başarısız olursa toast basılmaz. Süper Lig maçları için `preloadSuperLigMatchContext(params)` kullanılır.
- **Odak yenileme:** `FOCUS_REFRESH_MIN_INTERVAL_MS = 10 dakika` — uygulamaya dönüşte bu süreden az geçmişse veri yenilenmez.
- **Context prefetch:** `DETAIL_CONTEXT_PREFETCH_LIMIT = 12` maç, `DETAIL_CONTEXT_PREFETCH_BATCH_SIZE = 3` paralel istek.
- **Metrik motoru** (`computeMetrics`, `findStanding`, `buildHomeCardAnalysis` — `utils/matchMetrics.ts`):
  - Standings satırı önce `teamId`, olmazsa normalize edilmiş takım adı ile eşleşir.
  - Beklenen gol, puan/maç, takım gol atma/yeme ortalamaları ve tablo konumu gibi gerçek sezon metriklerinden türetilir.
  - Ana kart başlığı ve kısa yorumu artık `buildScoutPick` karar hattından gelir: kart başlığı `pick.label`, kısa yorum `pick.cardComment`.
  - `buildMatchContextScoutAnalysis` — Scout modundaki `SingleInsightCard` bileşeni için context verisini kullanarak daha zengin analiz üretir.
- **Scout modu:**
  1. **GÜNÜN MAÇI** — backend `featuredMatchId` varsa o maç kullanılır; yoksa `selectFeaturedMatch()` / `scoutScore()` ile seçilir. Tarih bazlı cache nedeniyle aynı tarih için seçilen maç değişmemelidir.
  2. **GÜNÜN ÖNE ÇIKANLARI** — sonraki scout maçları kartlarla gösterilir.
  3. **BUGÜN NE BEKLENİYOR?** — gün genelindeki metriklerden özet.
  4. **GÜNÜN KALAN MAÇLARI** — sadece kalan maç varsa başlık gösterilir; hepsi tamamlandıysa başlık saklanır.
- Lig filtresi veya başka bir gün seçilince sade liste görünümü aktif olur; maç satırları yine aynı kart analiz kararını kullanır.
- Veri eksik durumlarda sahte değer üretilmez; `metrics.reason` gösterilir.
- Push bildirimler ekran yüklendiğinde `scheduleNotifications` ile güncellenir.

### `app/match_detail.tsx` — Maç Detayı
- **Tek-scroll analiz sayfası** (sekme yok). Route parametrelerinden fallback match kurulur; bu sayede context geç gelirse skor/temel maç bilgisi yine hızlı çizilir.
- Ana context akışı `getMatchContext(matchId, finished, { silent: Boolean(routeFallbackMatch) })` ile çalışır. Context gelmezse team form + H2H fallback'leri kullanılır; ikincil fallback hataları kullanıcıya toast olarak basılmaz.
- **Scout karar hattı:**
  - `buildMatchAnalysis()` stil/gol/tempo/risk/güven etiketlerini ve `scoutPick` kararını üretir.
  - `buildScoutPick()` tek karar kaynağıdır: label, detail, `cardComment`, tone.
  - `buildScoutSummaryFromPick()` Scout Özeti'ni aynı pick üzerinden yazar; özet veri raporu değil analist yorumu gibi olmalıdır.
  - "Neden? — Gerekçeleri göster" bölümü daha sayısal ve kanıt odaklı kalabilir.
- **Performans Profili** radar grafiği `react-native-svg` ile 5 eksen kullanır: Hücum, Savunma, Form, Galibiyet, 2.5 Üst. Etiketler kırpılmayacak şekilde anchor'lanır (`RadarChart.tsx`).
- Sıralı bölümler: Scout Özeti, Performans Profili, Takım Karşılaştırması, Son Form, İç Saha/Deplasman Analizi, H2H, hava/hakem/oran/motivasyon gibi veri varsa gösterilen ek analizler.
- **Oranlar** ayrı ana sekme değildir; `getOdds()` sonucu `getOddsComment()` içinde analiz metnine gömülür.

### `app/sl_match_detail.tsx` — Süper Lig Maç Detayı
- TheSportsDB `lookupevent.php` üzerinden gol/kart timeline, form istatistikleri, radar grafiği, hava durumu ve hakem profili gösterir.
- `getSuperLigMatchContext(params)` ile tek çağrıda event + homeContext + awayContext + H2H yüklenir. Preload desteği: `preloadSuperLigMatchContext`.
- `buildScoutPick` / `buildScoutSummaryFromPick` / `buildReasons` — `match_detail.tsx` ile aynı analiz hattı.
- Secondary cache: `sl_match_detail_secondary_v1_{matchId}`.
- Backend cache: tamamlanan maçlar 1 saat, devam edenler 60 saniye.

### `app/leagues.tsx` — Lig Paneli
- 7 lig desteklenir (Premier Lig, La Liga, Bundesliga, Serie A, Ligue 1, UCL, Süper Lig).
- **4 alt sekme:** Genel · Puan Tablosu · Takımlar · Trendler.
  - **Genel:** lig özeti (stil/gol/tempo/risk etiketli pill'ler), lig karakteri kartı, lider anlatımı (Hücum/Savunma Gücü 0-10 skoru dahil), "Gol Verimliliği" özeti.
  - **Puan Tablosu:** pozisyon badge'leri + renk kodları (aşağıda). AG kolonu gerçek averajı gösterir (`gf - ga`; pozitifse `+N` önekiyle).
  - **Takımlar:** alfabetik takım kartları. Her kartta profil etiketi + "Hücum X.XX/10 · Savunma Y.YY/10" satırı + Gol/M, Yenilen/M, Galibiyet%, Puan. `team_stats`'a gider.
  - **Trendler:** lig geneli metrikler (gol skoru, tempo skoru, rekabet skoru, sürpriz oranı; güçlü hücum / sağlam savunma / tempolu / yüksek galibiyet oranlı öne çıkanlar).
- **Hücum/Savunma Gücü skoru:** lig içi **min-max normalizasyon**, 1.00-10.00 aralığında. `attackScore(team) = 1 + (gfPer(team) - minGfPer) / (maxGfPer - minGfPer) * 9` (en çok atan = 10.00, en az atan = 1.00). `defenseScore(team)` benzer ama `ga/maç` için ters yön (en az yiyen = 10.00). Eski rank-based + Math.round formülü kaldırıldı.
- **UCL özel:** "Puan Tablosu / Eşleşmeler" (`uclView: 'standings' | 'bracket'`) toggle; bracket modunda stage sekmeleri (Play-off, Son 16, Çeyrek Final, Yarı Final, Final). `groupTies()` iki bacaklı turu tek karta indirir, `tieResult()` agregat skoru hesaplar.
- UCL 2026 yarı final takımları `leagueAnalysis.ts`'te `KNOWN_UCL_2026_SEMI_FINAL_TEAMS` sabitiyle hard-coded (PSG-Bayern, Atleti-Arsenal). Yeni sezon gelince kaldır.
- Puan tablosu pozisyon badge renkleri (`getBadgeStyle`):
  - UCL lig fazı: 1-8 mavi `Direkt Son 16`, 9-24 sarı/turuncu `Play-off`.
  - Premier Lig: 1-5 mavi `Şampiyonlar Ligi`, 6 turuncu `Avrupa Ligi`, 18-20 kırmızı `Küme Düşme`; Konferans rengi kullanılmaz.
  - La Liga / Serie A: 1-4 mavi, 5 turuncu, 6 yeşil `Konferans Ligi Eleme`, 18-20 kırmızı.
  - Bundesliga: 1-4 mavi, 5 turuncu, 6 yeşil, 16 koyu kırmızı `Küme Düşme Play-off`, 17-18 kırmızı.
  - Ligue 1: 1-3 mavi, 4 farklı mavi `Şampiyonlar Ligi Eleme`, 5 turuncu, 6 yeşil, 16 koyu kırmızı play-off, 17-18 kırmızı.
  - Süper Lig: 1 mavi, 2 `Şampiyonlar Ligi Eleme`, 3 `Avrupa Ligi Eleme`, 4 yeşil `Konferans Ligi Eleme`, 16-18 kırmızı.

### `app/stats.tsx` — İstatistik Lig Seçimi
- 7 lig listelenir (Süper Lig dahil).
- Her lig `team_detail` ekranına `{ leagueName, leagueFlag, fdId, apiId }` parametresiyle yönlendirir.

### `app/team_detail.tsx` — Takım Listesi
- Seçilen ligin takımlarını alfabetik listeler (`localeCompare('tr')`).
- `apiId === 203` ise `getSuperLigStandings()`, diğerleri `getStandings(apiId)` kullanır.
- Takıma tıklamak `team_stats` ekranına `teamId` (`(team as any).teamId || team.id || 0` fallback), `fdId`, `apiId` ve tüm standings verisini geçirir.

### `app/team_stats.tsx` — Takım İstatistikleri
- 2 sekme: Takım İstatistikleri, Oyuncular.
- Ekrana girerken `scout_recent` AsyncStorage anahtarına (`recordRecentlyViewed`) takım kaydı düşer — profile'daki "SON BAKILANLAR" bölümünü besler.
- **Takım profil kartı** (`getTeamProfile`, üstte): avg GF/GA ve galibiyet yüzdesine göre otomatik etiket — Dominant 👑, Tempolu ⚡, Hücumcu ⚽, Katı Savunmacı 🛡️, Savunmacı 🛡️, Kırılgan Savunma 🚨, Kontrollü 📈, Dengeli ⚖️. Profil kartı 3 makro metriği (Gol/Maç, Yenilen/Maç, Galibiyet %) taşır.
- **Takım İstatistikleri bölümleri** (yukarıdan aşağıya):
  1. **Son Form** (en üstte) — G/B/M rozetleri (tek ton yeşil/gri/kırmızı; iç saha/deplasman ayrımı renkle değil etikette).
  2. **Maç Özeti** — kompakt kart: Maç/Galibiyet/Beraberlik/Mağlubiyet/Puan + altında W-D-L bar (renkli segment oranı).
  3. **Gol** — 3 makro rakam yan yana: Atılan (yeşil), Yenilen (kırmızı), Averaj (+/−).
  4. **Gol Beklentileri** — 1.5/2.5/3.5 Üst yüzdeleri yatay progress bar formatında.
  5. **Özel Durumlar** — KG Var, Kale Sıfır, Gol Atamadı (3'lü kart satırı).
  6. **İç Saha vs Deplasman** — karşılaştırma kartı: her saha için G-B-M kaydı + görsel W-D-L barı.
  7. **Korner & Pozisyon** (AllSports) — aktifse.
  8. **Geçen Sezon Detay** (AF 2024/25) — `RAPID_API_KEY` aktifse: kalesini sıfır, gol atamadı, sarı/kırmızı kart toplamları.
- **Tasarım notu:** Profil kartında zaten görülen "Gol/Maç" ve "Yenilen/Maç" değerleri aşağıdaki GOL bölümünde tekrar edilmez.
- **Son Form davranışı:** `displayForm = apiId === 203 ? slForm : recentForm`. Form yalnızca **mevcut sezon** verisinden gelir. AF 2024/25 verisindeki `form` alanı kullanılmaz. ESPN fallback liglerinde (`teamId = 0`) form yüklenemediği için dürüstçe "Form verisi bulunamadı" gösterilir.
- **Oyuncular:** FD gol/asist sıralaması (`fdScorers`), pozisyona göre gruplanmış kadro görünümü (`fdSquad`, G/D/M/F).
- **Süper Lig özel davranışı** (`apiId === 203`):
  - `loadSLData()` çalışır: `getSuperLigTeamForm(teamId)` ile son maçlar, `getSuperLigPlayers(teamId)` ile kadro, `getSuperLigScorers()` ile lig gol krallığı.
  - Form ve sezon analizi takım özelinde hesaplanır (`calcSLSeasonStats`).
  - Gol krallığı `transliterate()` ile takım bazlı filtrelenir (Türkçe diakritiklere dayanıklı).

### `app/profile.tsx` — Scout Rozeti
- AsyncStorage tabanlı profil ekranı. Backend bağımlılığı sadece bildirim token kaydı ve standings çekimi için.
- Anahtarlar: `scout_name`, `scout_avatar`, `scout_fav_team`, `scout_watchlist`, `scout_recent`.
- Bildirim tercihleri: `scout_notif_prefs_v2` (`NotifPrefs: { daily, favTeam, featured }`).
- **Bölümler:**
  - **Scout Kimlik Kartı:** düzenlenebilir isim, 8 renkli avatar picker (modal).
  - **Favori Takım:** takım seçim modalı (lig gruplamalı, aranabilir). Takım listesi önce standings'ten dinamik yüklenir (`profile_team_picker_standings_v1_{apiId}` cache, 1 saat TTL), standings yoksa `LEAGUES_TEAMS` hard-coded listesi fallback olur. Seçilen takım takım renkleriyle (`TEAM_COLORS`) kartta gösterilir. Puan durumu, liderden fark, son 5 maç formu çekilir (standings + team-form). Karta tıklayınca `team_stats`'a gider.
  - **Takip Listesi:** çoklu takım; her satırda son 3 maç form noktaları ve standings'ten çekilmiş kısa istatistik.
  - **Son Bakılanlar:** `team_stats` ziyaretlerinden beslenir (max 10 kayıt, 8'i gösterilir, "Temizle" butonu ile sıfırlanır).
  - **Ayarlar:** Bildirim tercihleri (daily/favTeam/featured toggle'ları — `scheduleNotifications` ile gerçek zamanlama), tema seçimi (Açık/Koyu/Otomatik), Twitter/Instagram linkleri, versiyon etiketi.
- `TEAM_COLORS`: takım adına göre primary/secondary renk eşlemesi (Galatasaray `#C8102E`/`#F5A623`, Fenerbahçe `#1B3D7F`/`#FFD700` vb.). Eşleşme bulunamazsa varsayılan mavi tonları.

---

## `services/api.ts` Fonksiyonları

```typescript
// Football-data.org
getStandings(leagueId: number)             // LEAGUE_MAP ile apiId → fdId dönüşümü
getHomeData(date?: string)                 // ana ekran birleşik payload (matches + SL + standings + nextPreview)
getTodayMatches(date?: string)
getMatchStats(matchId: string)
preloadMatchContext(matchId, isFinished?, options?)  // detay context prefetch; dedup + silent destekler
getMatchContext(matchId, isFinished?, options?)      // match + form + H2H context
getH2H(matchId: string, isFinished?, options?)       // options.silent ile ikincil hatalar susturulabilir
getTeamForm(teamId: number)
getTopScorers(fdId: number)
getWeather(city: string)
getOdds(homeTeam, awayTeam, leagueApiId)   // 30 dk frontend cache

// API-Football (RAPID_API_KEY gerekli; aksi halde boş döner)
getAfLeagueTeams(leagueId, season?)
getAfTeamStats(leagueId, afTeamId, season?)
getAfTopScorers(leagueId, season?)
getAfTopAssists(leagueId, season?)
getAfSquad(afTeamId)
getFdTeamData(teamId)                      // football-data.org takım + kadro

// UCL
getUclKnockouts(season?)                   // default: CURRENT_FOOTBALL_SEASON

// Süper Lig (TheSportsDB)
getSuperLigStandings()
getSuperLigMatches(date?: string)          // tarihe göre maç listesi
getSuperLigTeamForm(teamId: number)        // takımın son maçları
getSuperLigPlayers(teamId: number)         // takım kadrosu
getSuperLigScorers()                       // gol krallığı (lig geneli, takım bilgili)
getSuperLigMatch(eventId: string)          // maç detayı (sl_match_detail için)
getSuperLigTeamContext(teamId: number)     // takım form + standings context
getSuperLigMatchContext(params)            // event + homeContext + awayContext + H2H
preloadSuperLigMatchContext(params)        // sl_match_detail için dedup prefetch

// SportsDB — Europa / Conference League
getSportsDbLeagueMatches(leagueId: number, date?: string)
getSportsDbTeamForm(leagueId: number, teamId: number)
getSportsDbStandings(leagueId: number)
getSportsDbMatch(eventId: string)

// AllSports (korner + possession)
getAllSportsTeamStats(teamName: string)
getAllSportsH2H(homeTeam: string, awayTeam: string)

// Yardımcılar
getCityForTeam(teamName: string): string | null   // TEAM_CITIES map'inden şehir; tanınmayan takım → null
checkBackendHealth(): Promise<boolean>            // /health endpoint
```

---

## Tema Sistemi

`context/ThemeContext.tsx` + `constants/colors.ts` birlikte çalışır.

- **Modlar:** `'light'` | `'dark'` | `'system'`
- **System modu:** Saat 07:00–20:00 arası açık tema, dışarısı koyu tema. Her dakika saate bakılır.
- **Kalıcılık:** `AsyncStorage` → `scout_theme_mode`
- **Kullanım:** Her bileşende `const { colors, isDark } = useTheme()` ile tema renklerine erişilir.
- **Renk paleti:** `lightColors` ve `darkColors` `ThemeColors` tipini implement eder.

| Token | Light | Dark |
|---|---|---|
| `colors.bg` | `#F8F9FB` | `#0D1117` |
| `colors.surface` | `#ffffff` | `#161B22` |
| `colors.text` | `#111111` | `#E6EDF3` |
| `colors.primary` | `#185FA5` | `#58A6FF` |
| `colors.win` | `#27AE60` | `#3FB950` |
| `colors.loss` | `#C0392B` | `#F85149` |

---

## Push Bildirim Sistemi

`services/notifications.ts` — `expo-notifications` tabanlı gerçek kurulum.

**NotifPrefs türleri:**
- `daily: boolean` — "Bugünün analizleri hazır" (saat 12:00 yerel)
- `favTeam: boolean` — Favori + watchlist takımlarının maçları, maçtan 30 dk önce
- `featured: boolean` — Günün öne çıkan maçı (saat 12:00 yerel)

**Ana fonksiyonlar:**
- `scheduleNotifications(data, prefs)` — Mevcut maç hatırlatmalarını iptal et ve yeniden planla
- `registerPushToken(prefs, watchedTeams)` — Expo push token al, backend `/register-token`'a kaydet
- `requestPermissions()` — Android kanalı + izin
- `cancelAllNotifications()` — Tüm Scout bildirimlerini iptal et
- `loadNotifPrefs()` / `saveNotifPrefs(prefs)` — `scout_notif_prefs_v2` AsyncStorage

---

## Kod Stili ve Kurallar

### Genel
- TypeScript, `StyleSheet.create()` ile inline stiller
- Expo Router (file-based navigation, `useRouter`, `useLocalSearchParams`)
- Her ekranın altında bottom nav: Maçlar | Ligler | İstatistik | Profil (`components/BottomTabBar.tsx`)
- Tema: `useTheme()` hook'u ile `colors` ve `isDark` alınır; sabit renk kodu yerine `colors.primary` gibi token kullanılır.

### Renk Paleti (Light Mode — referans)
```
Ana mavi:        #185FA5  (colors.primary)
Koyu mavi:       #0C447C  (colors.primaryDark)
Açık mavi bg:    #E6F1FB  (colors.primaryLight)
Kırmızı:         #A32D2D
Yeşil:           #27500A
Sarı:            #E6A817
```

### Veri Akışı Kuralı
`services/api.ts` → backend URL → Railway → harici API  
Harici API'lere frontend'den **doğrudan istek atılmaz**. Her şey backend üzerinden geçer.

### Analiz ve Yorum Kuralı
- Ana kart, Scout Özeti, Scout Pick ve Scout Pick açıklaması aynı maç senaryosunu anlatmalıdır.
- Tek karar kaynağı `utils/matchAnalysis.ts` içindeki `buildScoutPick()` olmalıdır. Yeni metin eklenirken `label`, `detail`, `cardComment`, `tone` birlikte düşünülmelidir.
- `buildScoutSummaryFromPick()` Scout Özeti'ni pick kararına bağlı yorumlar. Burada sayı kalabalığı yapma; veri anlamını futbol diliyle açıkla.
- Detaylı sayısal kanıtlar `buildReasons()` / "Neden?" bölümünde ve takım karşılaştırma tablolarında kalabilir.
- "Kesin", "banko", "garanti" gibi iddialı ifadeler kullanılmaz. Veri sınırlıysa veya sinyaller çelişiyorsa analiz bunu açıkça söylemeli.
- Ana ekran daha sınırlı standings verisiyle başlayabilir; bu nedenle ana kartlar detay kadar derin veri iddiasında bulunmamalı. Context hazır olduğunda detay daha zengin yorumlar.

### Hata Bildirimi Kuralı
- Kullanıcıya sadece ekranı kullanılamaz hale getiren hatalar gösterilmeli.
- Arka plan/preload/context/H2H/weather/odds gibi ikincil yenileme hataları, ekranda kullanılabilir veri varsa toast olarak basılmaz.
- `services/api.ts` içinde ilgili fonksiyonlara `options.silent` eklenebilir; silent modunda `logApiError()` çağrılmaz. (`services/apiResponse.ts` içindedir.)

### Cache Key Versiyonlama
Cache'lenmiş boş veri sorunu yaşanırsa cache key'ine `_v2`, `_v3` gibi sürüm ekle.  
Mevcut sürümler:
- `scout_standings_cache_v5` (AsyncStorage — frontend index.tsx)
- `scout_featured_match_cache_v3` (AsyncStorage — featured maç tarih bazlı cache)
- `scout_home_data_cache_v1:{date}` (AsyncStorage — ana ekran cache-first veri)
- `scout_notif_prefs_v2` (AsyncStorage — bildirim tercihleri)
- `match_detail_secondary_v1_{matchId}` ve `sl_match_detail_secondary_v1_{matchId}` (detay sayfası ikincil H2H/weather/odds cache)
- `af_topscorers_v2_{leagueId}_{season}`
- `af_leagueteams_v2_{leagueId}_{season}`
- `superlig_standings_v1`, `superlig_matches_v1_{date}`, `superlig_scorers_v1`, `superlig_form_season_v3_{teamId}`, `superlig_players_v1_{teamId}`
- `profile_team_picker_standings_v1_{apiId}` (profil takım seçici, 1 saat TTL)
- `league_standings_v1_{apiId}` (leagues.tsx standings cache, 1 saat TTL)
- `odds_match_{leagueApiId}_{homeTeam}_{awayTeam}` (30 dk TTL)
- `scout_theme_mode` (light/dark/system)
- Backend: `standings_v3_{id}`

### Backend'e Yeni Endpoint Ekleme
1. `routes/` veya `app.js`'e endpoint ekle
2. `services/api.ts`'e karşılık gelen fonksiyonu ekle
3. `git add ... && git commit && git push` (Railway otomatik deploy eder)
4. Frontend değişikliklerini ayrı commit'te yapabilirsin

---

## UCL Eşleşmeleri

UCL knockout bracket mantığı `leagues.tsx` + `utils/leagueAnalysis.ts` içindedir.

**Aşama listesi:**
```
KNOCKOUT_ROUND_PLAY_OFF  → Play-off
ROUND_OF_16              → Son 16
QUARTER_FINALS           → Çeyrek Final
SEMI_FINALS              → Yarı Final
FINAL                    → Final
```

**Stage normalizasyonu** (server.js `normalizeStage()`):
- `LAST_16` → `ROUND_OF_16`
- `*PLAY_OFF*` veya `*PLAYOFF*` içeren her string → `KNOCKOUT_ROUND_PLAY_OFF`
- Blacklist yaklaşımı: `NON_KNOCKOUT_STAGES` dışındaki her stage knockout kabul edilir (whitelist yerine blacklist — yeni sezon key değişikliklerine karşı dayanıklı)

**UCL bracket:** Tamamen dinamik — hardcoded maç/takım ID'si yok. API doğru veri döndürdüğünde otomatik çalışır; eksik bilgi geldiğinde TBD gösterilir.

---

## Bilinen Kısıtlamalar

| Durum | Açıklama |
|---|---|
| Süper Lig takımları TheSportsDB ID bağımlı | Takım ID'leri `profile.tsx` içinde hard-coded. Listede olmayan takımlar (yeni çıkan / yükselen) eklenene kadar favori/form/kadro çalışmaz. Tüm mevcut takımlar eklendi (Kasımpaşa 133834 dahil). |
| Süper Lig maç detayı | `app/sl_match_detail.tsx` ile uygulandı. TheSportsDB `lookupevent.php` üzerinden gol/kart timeline, form istatistikleri, radar grafiği, hava durumu ve hakem profili gösterilir. Backend cache'li (tamamlanan: 1 saat, devam eden: 60s). |
| Serie A / Ligue 1 / UCL standings — ESPN'den, takım satırlarında `teamId = 0` | ESPN ID'leri football-data.org ile örtüşmez. Ancak `/matches` endpoint'i doğrudan FD'den geldiği için bu liglerin maç objelerinde gerçek FD team ID'leri bulunur — `match_detail` üzerinden form + kadro çalışır. Yalnızca `leagues` → `team_stats` yolunda (standings tabanlı) form yüklenmez. Ana ekrandaki metrik motoru name-fallback ile standings satırını yine de bulur. |
| API-Football kapalı | `RAPID_API_KEY` ayarlanmamış. `/af/` endpoint'leri boş döner. Önceki sezon takım detayları (kart, kale sıfır vb.) görünmez. |
| UCL puan tablosu — lig fazı bitti | Nisan 2026 itibarıyla UCL lig fazı bitti; puan tablosu son durumu gösterir, güncellenmez. Artık UCL için bracket görünümü daha anlamlı. |
| UCL puan tablosu — lig fazı bitti | Nisan 2026 itibarıyla UCL lig fazı bitti; puan tablosu son durumu gösterir. Bracket görünümü API'den dinamik gelir, hardcode yok. |

---

## Geliştirme Ortamı

```bash
# Frontend başlat (proje kök dizininde — repo adı: ScoutFootball)
npx expo start

# TypeScript kontrolü
npx tsc --noEmit --skipLibCheck

# Backend/frontend push (Railway backend'i otomatik deploy eder)
git add <dosyalar>
git commit -m "..."
git push
```

Test: Expo Go uygulamasıyla QR kod taranır.

> Not: Bu repo iki ortamda paralel çalışılıyor olabilir — Windows (`C:\Users\umutn\Desktop\ScoutFootball`) ve macOS (`~/Desktop/scout-football/Scout-Football`). Mutlak path'e bağlanma; relatif çalış.

---

## Gelecekte Yapılabilecekler

- Ana ekranda context hazırsa kart analizini de direkt detay context verisiyle beslemek, ana kart ve detay arasındaki veri derinliği farkını daha da azaltır.
- Oyuncu detay sayfası (profil + istatistikler) — kadro satırlarından tıklanabilir hale getir
- Google Play yayını (build + store listing)
- Hava sekmesi genişletmesi: o hava koşullarındaki takım performans geçmişi
- Süper Lig takım listesinin dinamik çekilmesi (TheSportsDB `search_all_teams.php?l=Turkish Super Lig`) — böylece yeni sezon takımları otomatik gelir
- API-Football (`RAPID_API_KEY`) aktifleştirilirse: takım detayları (kart, kale sıfır, sarı-kırmızı vb.) çok daha zengin hale gelir
- Profile → "Son Bakılanlar" için takım başına hızlı kıyaslama grafikleri
- Bildirim kanalı genişletmesi: şu an local scheduling; ileride backend-driven push (cron + Expo push API) kurulabilir

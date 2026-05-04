# ScoutFootball — CLAUDE.md

## Guncel Durum Notlari (2026-05-05)

- Railway backend artik ana GitHub reposuna bagli: `umuttnurayy-beep/Scout-Football`, branch `main`, root directory `/ScoutFootball-Backend`.
- Ayrik `ScoutFootball-Backend` reposu eski deploy kaynagi olarak kalabilir; aktif deploy akisi ana repo uzerinden yurumelidir.
- Railway production variables: `ALLSPORTS_KEY`, `FOOTBALL_DATA_KEY`, `MONGODB_URI`, `ODDS_API_KEY`, `RAPID_API_KEY`, `WEATHER_KEY`.
- `WEATHER_API_KEY` Railway build secret hatasi verdigi icin kullanilmiyor; backend `WEATHER_KEY` okur.
- Push token kaydi aktif: Expo `projectId` app config icinde, `/register-token` MongoDB `PushToken` koleksiyonuna yazar, `/push/status` ile kontrol edilir.
- EAS project ID: `82f6a1df-704f-4f50-b813-3bc9b2e33e4e`.
- iOS bundle id ve Android package: `com.umutnuray.scoutfootball`.
- OTA update hazirligi yapildi: `expo-updates`, `updates.url`, `runtimeVersion.policy = appVersion`, EAS production channel `production`.
- Ana ekran `getHomeData(date)` ile tek payload uzerinden beslenir. Tarih degisiminde once AsyncStorage home cache gosterilir, ardindan taze veri arka planda yenilenir; kullaniciya "son cache" uyarisi basilmaz.
- Ana ekrandan mac detayina geciste mac context preload sessizdir. Arka plan `getMatchContext`/H2H/ikincil veri hatalari sayfa zaten cizilebiliyorsa toast olarak gosterilmez.
- Gunun maci backend `featuredMatchId` ile gelir ve frontend'de tarih bazli cache'lenir; bir tarih icin secilen gunun maci sonradan degismemelidir.
- Analiz metinleri tek karar hattindan beslenir: `buildScoutPick` karar uretir, ana kart kisa yorumu `cardComment`, Scout Ozeti `buildScoutSummaryFromPick`, Pick aciklamasi `detail` alanini kullanir.
- Scout Ozeti veri raporu degil analist yorumu gibi yazilmalidir: sayi kalabaligi yerine hucum-savunma eslesmesi, form etkisi, saha/deplasman dengesi, gol senaryosu ve risk yorumu one alinmali; detayli sayilar "Neden? / gerekceler" ve alt bolumlerde kalmalidir.
- Radar grafikte sag/sol yatay etiketler kirpilmeyecek sekilde anchor'lanir; capraz etiketler kendi eksen noktasinda ortali kalmalidir (`components/RadarChart.tsx`).


## Build ve Submit Notlari

- Production build komutu: `eas build --profile production --platform all --auto-submit`.
- `app.json`: `ios.bundleIdentifier`, `ios.buildNumber`, `android.package`, `android.versionCode`, `updates.url`, `runtimeVersion` tanimli.
- `eas.json`: production `channel=production`, Android `buildType=app-bundle`, `autoIncrement=true`, submit Android `track=internal`.
- Auto-submit icin EAS/Store tarafinda Android Play service account ve iOS App Store Connect uygulama kaydi/credential kurulumu gerekebilir; bos `ascAppId` veya `appleTeamId` degerleri `eas.json`a yazilmaz.

Türkçe konuşan bir geliştirici tarafından inşa edilen, futbol maç takibi ve bahis analizi yapan mobil uygulama.

---

## Proje Yapısı

```
ScoutFootball/                    ← React Native + Expo (frontend)
├── app/
│   ├── _layout.tsx               ← Expo Router kök layout (Stack)
│   ├── index.tsx                 ← Ana ekran — günlük maçlar + Scout modu
│   ├── match_detail.tsx          ← Maç detay (tek-scroll analiz sayfası)
│   ├── leagues.tsx               ← Lig paneli (4 alt sekme) + UCL bracket
│   ├── stats.tsx                 ← İstatistik lig seçim ekranı
│   ├── team_detail.tsx           ← Lig takım listesi (A–Z)
│   ├── team_stats.tsx            ← Takım istatistik detayı (2 sekme)
│   └── profile.tsx               ← Scout rozeti: favori + takip listesi + ayarlar
├── services/
│   └── api.ts                    ← Tüm backend çağrıları burada
└── CLAUDE.md

ScoutFootball-Backend/            ← Node.js + Express (backend)
├── server.js                     ← start entrypoint
├── app.js                        ← Express app + route wiring
├── routes/                       ← Endpoint modulleri
├── services/                     ← Veri kaynaklari/cache/context servisleri
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
| Test | Expo Go (fiziksel telefon) |
| Hedef | Google Play Store |

---

## Backend

**URL:** `https://scoutfootball-backend-production.up.railway.app`

**GitHub:** `umuttnurayy-beep/Scout-Football` (branch: `main`, root directory: `/ScoutFootball-Backend`)

Railway, ana repo `main` branch'ine push gelince `/ScoutFootball-Backend` klasorunden otomatik deploy eder. Deploy genelde 1-2 dakika surer.

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

> `RAPID_API_KEY` bos veya upstream erisimi sorunlu oldugunda `/af/` endpoint'leri bos array/null doner ve frontend sessiz fallback yapar.
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
| Oranlar | 5 dakika |
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
`ODDS_LEAGUE_MAP` ile fdId → spor kodu eşleşmesi yapılır.

### WeatherAPI
`match_detail.tsx` → **HAVA ETKİSİ** bölümünde gösterilir.
`getCityForTeam(teamName)` fonksiyonu takım adından şehir çıkarır.

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

Backend entrypoint `server.js`, Express uygulama kurulumu ve route wiring ise `app.js` ve `routes/` altindadir. Eski notlarda "tum endpoint'ler server.js icinde" deniyordu; artik dogru kabul edilmemeli.

### Football-data.org Kökenli

| Method | Path | Açıklama | Cache Key |
|---|---|---|---|
| GET | `/standings/:leagueId` | Puan tablosu (ESPN fallback ile) | `standings_v3_{id}` |
| GET | `/matches?date=` | Günlük maçlar | `matches_{date}` |
| GET | `/home?date=` | Ana ekran birleşik payload'i (maclar + SL + standings + featured + preview) | home/date cache |
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

---

## Frontend Ekranları

### `app/index.tsx` — Ana Ekran
- Tarih seridi (±3 gun), lig filtreleri + **"Scout"** varsayilan filtresi.
- Ana veri akisi `getHomeData(dateStr)` uzerinden gelir. Backend payload'i maclar, Super Lig maclari, standings, `featuredMatchId` ve next preview alanlarini birlikte tasir.
- `loadMatches(date, silent)` cache-first calisir: once `scout_home_data_cache_v1:{date}` okunur ve ekrana basilir, sonra taze `/home` verisi arka planda yenilenir. Kullaniciya cache uyarisi gosterilmez.
- `applyHomeData()` Super Lig + ana ligleri birlestirir, kismi upstream sorunlarinda son iyi gorunen veriyi korumaya calisir.
- `hydratePartialHomeData()` ana mac kaynagi gecici eksikse ayni tarihin cache'inden eksik ana maclari tamamlar.
- Ana ekrandan detaya geciste `preloadMatchContext(id, finished, { silent: true })` calisir. Bu sadece hiz icindir; basarisiz olursa toast basilmaz.
- **Metrik motoru** (`computeMetrics`, `findStanding`, `buildHomeCardAnalysis`):
  - Standings satiri once `teamId`, olmazsa normalize edilmis takim adi ile eslesir.
  - Beklenen gol, puan/maç, takim gol atma/yeme ortalamalari ve tablo konumu gibi gercek sezon metriklerinden turetilir.
  - Ana kart basligi ve kisa yorumu artik `buildScoutPick` karar hattindan gelir: kart basligi `pick.label`, kisa yorum `pick.cardComment`.
  - Kart, Scout Ozeti ve Scout Pick ayni mac senaryosunu anlatmalidir; farkli metin motorlariyla ters sinyal uretmemelidir.
- **Scout modu**:
  1. **GUNUN MACI** — backend `featuredMatchId` varsa o mac kullanilir; yoksa `selectFeaturedMatch()` / `scoutScore()` ile secilir. Tarih bazli cache nedeniyle ayni tarih icin secilen mac degismemelidir.
  2. **GUNUN ONE CIKANLARI** — sonraki scout maclari kartlarla gosterilir.
  3. **BUGUN NE BEKLENIYOR?** — gun genelindeki metriklerden ozet.
  4. **GUNUN KALAN MACLARI** — sadece kalan mac varsa baslik gosterilir; hepsi tamamlandiysa baslik saklanir.
- Lig filtresi veya baska bir gun secilince sade liste gorunumu aktif olur; mac satirlari yine ayni kart analiz kararini kullanir.
- Veri eksik durumlarda sahte deger uretilmez; `metrics.reason` gosterilir.

### `app/match_detail.tsx` — Maç Detayı
- **Tek-scroll analiz sayfasi** (sekme yok). Route parametrelerinden fallback match kurulur; bu sayede context gec gelirse skor/temel mac bilgisi yine hizli cizilir.
- Ana context akisi `getMatchContext(matchId, finished, { silent: Boolean(routeFallbackMatch) })` ile calisir. Context gelmezse team form + H2H fallback'leri kullanilir; ikincil fallback hatalari kullaniciya toast olarak basilmaz.
- **Scout karar hatti**:
  - `buildMatchAnalysis()` stil/gol/tempo/risk/guven etiketlerini ve `scoutPick` kararini uretir.
  - `buildScoutPick()` tek karar kaynagidir: label, detail, `cardComment`, tone.
  - `buildScoutSummaryFromPick()` Scout Ozeti'ni ayni pick uzerinden yazar; ozet veri raporu degil analist yorumu gibi olmalidir.
  - "Neden? — Gerekceleri goster" bolumu daha sayisal ve kanit odakli kalabilir.
- **Performans Profili** radar grafigi `react-native-svg` ile 5 eksen kullanir: Hucum, Savunma, Form, Galibiyet, 2.5 Ust. Etiketler kirpilmeyecek sekilde anchor'lanir (`RadarChart.tsx`).
- Sirali bolumler: Scout Ozeti, Performans Profili, Takim Karsilastirmasi, Son Form, Ic Saha/Deplasman Analizi, H2H, hava/hakem/oran/motivasyon gibi veri varsa gosterilen ek analizler.
- **Oranlar** ayri ana sekme degildir; `getOdds()` sonucu `getOddsComment()` icinde analiz metnine gomulur.

### `app/leagues.tsx` — Lig Paneli
- 7 lig desteklenir (Premier Lig, La Liga, Bundesliga, Serie A, Ligue 1, UCL, Süper Lig).
- **4 alt sekme:** Genel · Puan Tablosu · Takımlar · Trendler.
  - **Genel:** lig özeti (stil/gol/tempo/risk etiketli pill'ler), lig karakteri kartı, lider anlatımı (Hücum/Savunma Gücü 0-10 skoru dahil), "Gol Verimliliği" özeti.
  - **Puan Tablosu:** pozisyon badge'leri + renk kodları (aşağıda). AG kolonu gerçek averajı gösterir (`gf - ga`; pozitifse `+N` önekiyle).
  - **Takımlar:** alfabetik takım kartları. Her kartta profil etiketi + "Hücum X.XX/10 · Savunma Y.YY/10" satırı + Gol/M, Yenilen/M, Galibiyet%, Puan. `team_stats`'a gider.
  - **Trendler:** lig geneli metrikler (gol skoru, tempo skoru, rekabet skoru, sürpriz oranı; güçlü hücum / sağlam savunma / tempolu / yüksek galibiyet oranlı öne çıkanlar).
- **Hücum/Savunma Gücü skoru:** lig içi **min-max normalizasyon**, 1.00-10.00 aralığında. `attackScore(team) = 1 + (gfPer(team) - minGfPer) / (maxGfPer - minGfPer) * 9` (en çok atan = 10.00, en az atan = 1.00). `defenseScore(team)` benzer ama `ga/maç` için ters yön (en az yiyen = 10.00). Eski rank-based + Math.round formülü (her ara değeri 10'a yuvarlayan) kaldırıldı — kullanıcı artık "10/10 savunma" gördüğünde bu ligin gerçekten en iyisi olduğundan emin olabilir.
- **UCL özel:** "Puan Tablosu / Eşleşmeler" (`uclView: 'standings' | 'bracket'`) toggle; bracket modunda stage sekmeleri (Play-off, Son 16, Çeyrek Final, Yarı Final, Final). `groupTies()` iki bacaklı turu tek karta indirir, `tieResult()` agregat skoru hesaplar.
- Puan tablosu pozisyon badge renkleri (`getBadgeStyle`):
  - UCL lig fazi: 1-8 mavi `Direkt Son 16`, 9-24 sari/turuncu `Play-off`.
  - Premier Lig: 1-5 mavi `Sampiyonlar Ligi`, 6 turuncu `Avrupa Ligi`, 18-20 kirmizi `Kume Dusme`; Konferans rengi kullanilmaz.
  - La Liga / Serie A: 1-4 mavi, 5 turuncu, 6 yesil `Konferans Ligi Eleme`, 18-20 kirmizi.
  - Bundesliga: 1-4 mavi, 5 turuncu, 6 yesil, 16 koyu kirmizi `Kume Dusme Play-off`, 17-18 kirmizi.
  - Ligue 1: 1-3 mavi, 4 farkli mavi `Sampiyonlar Ligi Eleme`, 5 turuncu, 6 yesil, 16 koyu kirmizi play-off, 17-18 kirmizi.
  - Super Lig: 1 mavi, 2 `Sampiyonlar Ligi Eleme`, 3 `Avrupa Ligi Eleme`, 4 yesil `Konferans Ligi Eleme`, 16-18 kirmizi.

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
- **Tasarım notu:** Profil kartında zaten görülen "Gol/Maç" ve "Yenilen/Maç" değerleri aşağıdaki GOL bölümünde tekrar edilmez (eski ekranda üç kez aynı rakam görünüyordu, temizlendi).
- **Son Form davranışı:** `displayForm = apiId === 203 ? slForm : recentForm`. Form yalnızca **mevcut sezon** verisinden gelir (`getTeamForm(teamId)` → FD current season). AF 2024/25 verisindeki `form` alanı artık **kullanılmaz** (önceden current form'u ezip geçen sezonun son 5 maçını gösteren bir bug vardı — kaldırıldı). ESPN fallback liglerinde (`teamId = 0`) form yüklenemediği için dürüstçe "Form verisi bulunamadı" gösterilir.
- **Oyuncular:** FD gol/asist sıralaması (`fdScorers`), pozisyona göre gruplanmış kadro görünümü (`fdSquad`, G/D/M/F).
- **Süper Lig özel davranışı** (`apiId === 203`):
  - `loadSLData()` çalışır: `getSuperLigTeamForm(teamId)` ile son maçlar, `getSuperLigPlayers(teamId)` ile kadro, `getSuperLigScorers()` ile lig gol krallığı.
  - Form ve sezon analizi takım özelinde hesaplanır (`calcSLSeasonStats`).
  - Gol krallığı `transliterate()` ile takım bazlı filtrelenir (Türkçe diakritiklere dayanıklı).

### `app/profile.tsx` — Scout Rozeti
- AsyncStorage tabanlı tamamen yerel profil ekranı. Backend bağımlılığı yok.
- Anahtarlar: `scout_name`, `scout_avatar`, `scout_fav_team`, `scout_watchlist`, `scout_recent`, `scout_notifications`.
- **Bölümler:**
  - **Scout Kimlik Kartı:** düzenlenebilir isim, 8 renkli avatar picker (modal).
  - **Favori Takım:** takım seçim modalı (lig gruplamalı, aranabilir); seçilen takım takım renkleriyle (`TEAM_COLORS`) kartta gösterilir. Puan durumu, liderden fark, son 5 maç formu çekilir (standings + team-form). Karta tıklayınca `team_stats`'a gider.
  - **Takip Listesi:** çoklu takım; her satırda son 3 maç form noktaları ve standings'ten çekilmiş kısa istatistik.
  - **Son Bakılanlar:** `team_stats` ziyaretlerinden beslenir (max 10 kayıt, 8'i gösterilir, "Temizle" butonu ile sıfırlanır).
  - **Ayarlar:** Maç Bildirimleri toggle (yalnızca AsyncStorage flag'i — henüz gerçek push yok), Twitter/Instagram linkleri, versiyon etiketi.
- `TEAM_COLORS`: takım adına göre primary/secondary renk eşlemesi (Galatasaray `#C8102E`/`#F5A623`, Fenerbahçe `#1B3D7F`/`#FFD700` vb.). Eşleşme bulunamazsa varsayılan mavi tonları.

---

## `services/api.ts` Fonksiyonları

```typescript
// Football-data.org
getStandings(leagueId: number)            // LEAGUE_MAP ile apiId → fdId dönüşümü
getHomeData(date?: string)                // ana ekran birleşik payload
getTodayMatches(date?: string)
getMatchStats(matchId: string)
preloadMatchContext(matchId, isFinished?, options?) // detay context prefetch; silent destekler
getMatchContext(matchId, isFinished?, options?)     // match + form + H2H context
getH2H(matchId: string, isFinished?, options?)      // options.silent ile ikincil hatalar susturulabilir
getTeamForm(teamId: number)
getTopScorers(fdId: number)
getWeather(city: string)
getOdds(homeTeam, awayTeam, leagueApiId)

// API-Football (RAPID_API_KEY gerekli; aksi halde boş döner)
getAfLeagueTeams(leagueId, season?)
getAfTeamStats(leagueId, afTeamId, season?)
getAfTopScorers(leagueId, season?)
getAfTopAssists(leagueId, season?)
getAfSquad(afTeamId)
getFdTeamData(teamId)                     // football-data.org takım + kadro

// UCL
getUclKnockouts(season?)                  // default: 2025

// Süper Lig (TheSportsDB)
getSuperLigStandings()
getSuperLigMatches(date?: string)         // tarihe göre maç listesi
getSuperLigTeamForm(teamId: number)       // takımın son maçları
getSuperLigPlayers(teamId: number)        // takım kadrosu
getSuperLigScorers()                      // gol krallığı (lig geneli, takım bilgili)
getSuperLigMatch(eventId: string)         // maç detayı (sl_match_detail için)

// SportsDB — Europa / Conference League
getSportsDbLeagueMatches(leagueId: number, date?: string)  // tarihe göre maç listesi
getSportsDbTeamForm(leagueId: number, teamId: number)      // takımın form maçları
getSportsDbStandings(leagueId: number)                     // puan tablosu
getSportsDbMatch(eventId: string)                          // maç detayı

// AllSports (korner + possession)
getAllSportsTeamStats(teamName: string)
getAllSportsH2H(homeTeam: string, awayTeam: string)  // H2H korner/possession

// Yardımcılar
getCityForTeam(teamName: string): string | null  // TEAM_CITIES map'inden şehir; tanınmayan takım → null
```

---

## Kod Stili ve Kurallar

### Genel
- TypeScript, `StyleSheet.create()` ile inline stiller
- Expo Router (file-based navigation, `useRouter`, `useLocalSearchParams`)
- Her ekranın altında bottom nav: Maçlar | Ligler | İstatistik | Profil
- Etiket yok (`tabBar` custom olarak her dosyada tekrarlanır)

### Renk Paleti
```
Ana mavi:        #185FA5
Koyu mavi:       #0C447C
Açık mavi bg:    #E6F1FB
Kırmızı:         #A32D2D
Yeşil:           #27500A
Sarı:            #E6A817
```

### Veri Akışı Kuralı
`services/api.ts` → backend URL → Railway → harici API  
Harici API'lere frontend'den **doğrudan istek atılmaz**. Her şey backend üzerinden geçer.

### Analiz ve Yorum Kuralı
- Ana kart, Scout Ozeti, Scout Pick ve Scout Pick aciklamasi ayni mac senaryosunu anlatmalidir.
- Tek karar kaynagi `utils/matchAnalysis.ts` icindeki `buildScoutPick()` olmalidir. Yeni metin eklenirken `label`, `detail`, `cardComment`, `tone` birlikte dusunulmelidir.
- `buildScoutSummaryFromPick()` Scout Ozeti'ni pick kararina bagli yorumlar. Burada sayi kalabaligi yapma; veri anlamini futbol diliyle acikla.
- Detayli sayisal kanitlar `buildReasons()` / "Neden?" bolumunde ve takim karsilastirma tablolarinda kalabilir.
- "Kesin", "banko", "garanti" gibi iddiali ifadeler kullanilmaz. Veri sinirliysa veya sinyaller celisiyorsa analiz bunu acikca soylemeli.
- Ana ekran daha sinirli standings verisiyle baslayabilir; bu nedenle ana kartlar detay kadar derin veri iddiasinda bulunmamali. Context hazir oldugunda detay daha zengin yorumlar.

### Hata Bildirimi Kuralı
- Kullaniciya sadece ekrani kullanilamaz hale getiren hatalar gosterilmeli.
- Arka plan/preload/context/H2H/weather/odds gibi ikincil yenileme hatalari, ekranda kullanilabilir veri varsa toast olarak basilmaz.
- `services/api.ts` icinde ilgili fonksiyonlara `options.silent` eklenebilir; silent modunda `logApiError()` cagrilmaz.

### Cache Key Versiyonlama
Cache'lenmiş boş veri sorunu yaşanırsa cache key'ine `_v2`, `_v3` gibi sürüm ekle.  
Mevcut sürümler:
- `scout_standings_cache_v2` (AsyncStorage — frontend index.tsx; backend `/standings/:leagueId` → `standings_v3_{id}`)
- `scout_home_data_cache_v1:{date}` (AsyncStorage — ana ekran cache-first veri)
- `match_detail_secondary_v1_{matchId}` ve `sl_match_detail_secondary_v1_{matchId}` (detay sayfası ikincil H2H/weather/odds cache)
- `af_topscorers_v2_{leagueId}_{season}`
- `af_leagueteams_v2_{leagueId}_{season}`
- `superlig_standings_v1`, `superlig_matches_v1_{date}`, `superlig_scorers_v1`, `superlig_form_season_v3_{teamId}`, `superlig_players_v1_{teamId}`

### Backend'e Yeni Endpoint Ekleme
1. `server.js`'e endpoint ekle
2. `services/api.ts`'e karşılık gelen fonksiyonu ekle
3. `git add server.js && git commit && git push` (Railway otomatik deploy eder)
4. Frontend değişikliklerini ayrı commit'te yapabilirsin

---

## UCL Eşleşmeleri

UCL knockout bracket mantığı `leagues.tsx` içindedir.

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

---

## Bilinen Kısıtlamalar

| Durum | Açıklama |
|---|---|
| Süper Lig takımları TheSportsDB ID bağımlı | Takım ID'leri `profile.tsx` içinde hard-coded. Listede olmayan takımlar (yeni çıkan / yükselen) eklenene kadar favori/form/kadro çalışmaz. Tüm mevcut takımlar eklendi (Kasımpaşa 133834 dahil). |
| Süper Lig maç detayı | `app/sl_match_detail.tsx` ile uygulandı. TheSportsDB `lookupevent.php` üzerinden gol/kart timeline, form istatistikleri, radar grafiği, hava durumu ve hakem profili gösterilir. Backend cache'li (tamamlanan: 1 saat, devam eden: 60s). |
| Serie A / Ligue 1 / UCL standings — ESPN'den, takım satırlarında `teamId = 0` | ESPN ID'leri football-data.org ile örtüşmez. **Ancak `/matches` endpoint'i doğrudan FD'den geldiği için** bu liglerin maç objelerinde gerçek FD team ID'leri bulunur — `match_detail` üzerinden form + kadro çalışır. Yalnızca `leagues` → `team_stats` yolunda (standings tabanlı) form yüklenmez. Ana ekrandaki metrik motoru name-fallback ile standings satırını yine de bulur. |
| API-Football kapalı | `RAPID_API_KEY` ayarlanmamış. `/af/` endpoint'leri boş döner. Önceki sezon takım detayları (kart, kale sıfır vb.) görünmez. |
| Maç bildirimleri placeholder | `profile.tsx`'teki "Maç Bildirimleri" toggle yalnızca AsyncStorage flag'i yazar — gerçek push notification altyapısı (expo-notifications) henüz kurulmamış. |
| UCL puan tablosu — lig fazı bitti | Nisan 2026 itibarıyla UCL lig fazı bitti; puan tablosu son durumu gösterir, güncellenmez. Artık UCL için bracket görünümü daha anlamlı. |

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

- Ana ekrandaki gunun maci + ilk scout maclari icin detay context cache'i backend tarafinda daha proaktif isitilabilir; bu, detay sayfasina girince verilerin hazir gelme oranini artirir.
- Ana ekranda context hazirsa kart analizini de direkt detay context verisiyle beslemek, ana kart ve detay arasindaki veri derinligi farkini daha da azaltir.
- Oyuncu detay sayfası (profil + istatistikler) — kadro satırlarından tıklanabilir hale getir
- Gerçek push bildirim altyapısı (`expo-notifications`): şu anda profile'daki toggle yalnızca flag.
- Google Play yayını (build + store listing)
- Hava sekmesi genişletmesi: o hava koşullarındaki takım performans geçmişi
- Süper Lig takım listesinin dinamik çekilmesi (TheSportsDB `search_all_teams.php?l=Turkish Super Lig`) — böylece yeni sezon takımları otomatik gelir
- API-Football (`RAPID_API_KEY`) aktifleştirilirse: takım detayları (kart, kale sıfır, sarı-kırmızı vb.) çok daha zengin hale gelir
- Bildirim zamanlaması mobil uygulamada lokal yapılır. Backend `register-token`, `push/status` ve korumalı `push/test` uçlarını tanı/gelecek kampanyalar için tutar; otomatik push cron çalıştırmaz.
- Profile → "Son Bakılanlar" için takım başına hızlı kıyaslama grafikleri

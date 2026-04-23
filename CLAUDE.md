# ScoutFootball — CLAUDE.md

Türkçe konuşan bir geliştirici tarafından inşa edilen, futbol maç takibi ve bahis analizi yapan mobil uygulama.

---

## Proje Yapısı

```
ScoutFootball/                    ← React Native + Expo (frontend)
├── app/
│   ├── _layout.tsx               ← Expo Router kök layout
│   ├── index.tsx                 ← Ana ekran (günlük maçlar)
│   ├── match_detail.tsx          ← Maç detay (5 sekme)
│   ├── leagues.tsx               ← Puan tablosu + UCL eşleşmeleri
│   ├── stats.tsx                 ← İstatistik lig seçim ekranı
│   ├── team_detail.tsx           ← Lig takım listesi
│   └── team_stats.tsx            ← Takım istatistik detayı
├── services/
│   └── api.ts                    ← Tüm backend çağrıları burada
└── CLAUDE.md

ScoutFootball-Backend/            ← Node.js + Express (backend)
└── server.js                     ← Tek dosya; tüm endpoint'ler burada
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

**GitHub:** `umuttnurayy-beep/ScoutFootball-Backend` (main branch: `master`)

Railway, `master` branch'e her push'ta otomatik deploy eder. Deploy ~1-2 dakika sürer.

### Ortam Değişkenleri (Railway)

| Değişken | Kaynak |
|---|---|
| `FOOTBALL_DATA_KEY` | football-data.org |
| `WEATHER_API_KEY` | WeatherAPI.com |
| `ODDS_API_KEY` | The Odds API |
| `COLLECT_API_KEY` | CollectAPI (`4Qz6E0Mb5mJUakOahviGOd:6MUZGgkLt8yLXwzbGPV9si`) |
| `MONGODB_URI` | Railway MongoDB eklentisi |
| `RAPID_API_KEY` | API-Football / RapidAPI (ayarlanmamış — boş string) |
| `ALLSPORTS_KEY` | AllSports API (ayarlanmamış — boş string) |

> `RAPID_API_KEY` boş olduğunda `apifootball()` fonksiyonu hata fırlatır. Bu yüzden tüm `/af/` endpoint'leri şu an boş array/null döner.

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

### CollectAPI (Süper Lig)
Yalnızca Türkiye Süper Ligi için. Diğer liglerde abonelik gerekir.

| Endpoint | Backend Rotası | Açıklama |
|---|---|---|
| `/football/league?league=super-lig` | `GET /superlig/standings` | Puan tablosu |
| `/football/results?league=super-lig` | `GET /superlig/results` | Son ~1 hafta sonuçları |
| `/football/goalKings?league=super-lig` | `GET /superlig/scorers` | Gol krallığı |

CollectAPI sonuçları `{ home, away, score, date }` formatında gelir. Gol krallığı `{ name, goals }` — takım bilgisi yok.

**Sponsor temizleme:** Takım adlarındaki sponsor önekleri (`cleanSLName()` ile) kaldırılır.
Örnek: `"Hesap.com Antalyaspor"` → `"Antalyaspor"`, `"ikas Eyüpspor"` → `"Eyüpspor"`

`SL_BASE_NAMES` listesine yeni bir Süper Lig takımı eklendiğinde buraya da eklenmeli.

### API-Football (RapidAPI) — Kısmen Aktif
`RAPID_API_KEY` ayarlanmadığından tüm `/af/` endpoint'leri boş döner. Ancak frontend kodu bu endpoint'lere çağrı yapar; sessizce fallback yapar.
- `getAfLeagueTeams(leagueId, season)` — lig takım listesi
- `getAfTeamStats(leagueId, teamId, season)` — detaylı takım istatistikleri
- `getAfTopScorers(leagueId, season)` — gol krallığı (asist dahil)
- `getAfTopAssists(leagueId, season)` — asist krallığı
- `getAfSquad(afTeamId)` — kadro

### The Odds API
Bahis oranları için. Maç detay ekranındaki "Oranlar" sekmesi kullanır.
`ODDS_LEAGUE_MAP` ile fdId → spor kodu eşleşmesi yapılır.

### WeatherAPI
Maç detay ekranındaki "Hava" sekmesi kullanır.
`getCityForTeam(teamName)` fonksiyonu takım adından şehir çıkarır.

---

## Lig ID Eşleştirme

| Lig | `apiId` (football-data.org) | `fdId` | ESPN Slug | CollectAPI |
|---|---|---|---|---|
| Premier Lig | 39 | 2021 | — | — |
| La Liga | 140 | 2014 | — | — |
| Bundesliga | 78 | 2002 | — | — |
| Serie A | 135 | 2019 | `ita.1` | — |
| Ligue 1 | 61 | 2015 | `fra.1` | — |
| UCL | 2 | 2001 | `uefa.champions` | — |
| Süper Lig | 203 | 0 | — | `super-lig` |

> `apiId`, football-data.org'un **competition ID**'sidir. `fdId` aynı değerin frontend'deki takma adıdır. `services/api.ts` içindeki `LEAGUE_MAP`, `apiId → fdId` dönüşümünü yapar.
>
> Süper Lig için `teamId: 0` — football-data.org veya API-Football'a bağlı özellikler (form geçmişi, oyuncu kadrosu) bu ligde **çalışmaz**.

---

## Backend Endpoint'leri (server.js)

### Football-data.org Kökenli

| Method | Path | Açıklama | Cache Key |
|---|---|---|---|
| GET | `/standings/:leagueId` | Puan tablosu (ESPN fallback ile) | `standings_v3_{id}` |
| GET | `/matches?date=` | Günlük maçlar | `matches_{date}` |
| GET | `/live` | Canlı maçlar | `live` |
| GET | `/match/:matchId` | Maç detay | `match_{id}` |
| GET | `/h2h/:matchId` | H2H geçmişi | `h2h_{id}` |
| GET | `/team/:teamId` | Takım + kadro | `team_{id}` |
| GET | `/team/:teamId/matches` | Takım son maçları | `team_matches_{id}` |
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

### Süper Lig (CollectAPI)

| Method | Path | Açıklama |
|---|---|---|
| GET | `/superlig/standings` | Puan tablosu |
| GET | `/superlig/results` | Son ~1 hafta maç sonuçları |
| GET | `/superlig/scorers` | Gol krallığı |

### Diğer

| Method | Path | Açıklama |
|---|---|---|
| GET | `/ucl/knockouts?season=` | UCL eleme eşleşmeleri |
| GET | `/health` | Backend sağlık kontrolü |

---

## Frontend Ekranları

### `app/index.tsx` — Ana Ekran
- Günlük maç listesi, tarih seçici (±3 gün), lig filtreleri
- `useFocusEffect` ile ekrana her dönüşte sessiz yenileme
- Canlı maçlar için 30 saniyede bir polling (`setInterval`)
- `loadMatches(date, silent)`: `silent=true` ise spinner göstermez
- `initialFocusDone` ref'i ile çift fetch engellenir
- Süper Lig maçları `getSuperLigResults()` ile çekilip tarih filtresiyle birleştirilir
- Süper Lig maçlarına tıklamak (leagueApiId: 203) maç detayına **gitmez** (API desteği yok)

### `app/match_detail.tsx` — Maç Detayı
- 5 sekme: İstatistik, H2H, Hava, Oranlar, Hakem
- SVG radar grafiği ve çubuk grafikleri ile istatistik görselleştirme
- H2H: son 10 karşılaşma, iç saha/deplasman formu
- Hava: `getCityForTeam()` ile şehir tespiti, WeatherAPI
- Oranlar: The Odds API, en iyi bahisçi oranları

### `app/leagues.tsx` — Puan Tablosu
- 7 lig desteklenir (Premier Lig, La Liga, Bundesliga, Serie A, Ligue 1, UCL, Süper Lig)
- UCL için "Puan Tablosu / Eşleşmeler" toggle
- UCL eşleşmeleri: `groupTies()` ile çift bacaklı turu tek kart olarak gösterir
- Puan tablosu pozisyon badge renkleri:
  - Mavi `#185FA5` → UCL
  - Sarı `#E6A817` → Avrupa Ligi
  - Yeşil `#27AE60` → Konferans Ligi
  - Kırmızı `#C0392B` → Küme düşme (yalnızca Süper Lig)
- "Gol Verimliliği" bölümü: tüm ligler
- "Gol Krallığı" bölümü: yalnızca Süper Lig (`slScorers`)

### `app/stats.tsx` — İstatistik Lig Seçimi
- 7 lig listelenir (Süper Lig dahil)
- Her lig `team_detail` ekranına `{ leagueName, leagueFlag, fdId, apiId }` parametresiyle yönlendirir

### `app/team_detail.tsx` — Takım Listesi
- Seçilen ligin takımlarını alfabetik listeler
- `apiId === 203` ise `getSuperLigStandings()`, diğerleri `getStandings(apiId)` kullanır
- Takıma tıklamak `team_stats` ekranına `teamId`, `fdId`, `apiId` ve tüm standings verisini geçirir

### `app/team_stats.tsx` — Takım İstatistikleri
- 2 sekme: Takım İstatistikleri, Oyuncular
- **Takım İstatistikleri:** Genel (oynanan/puan/galibiyet), Gol, Sezon Analizi (over%, BTTS%, kale sıfır%), İç saha/Deplasman, Korner & Pozisyon (AllSports), Geçen Sezon Detay (AF 2024/25), Son Form
- **Oyuncular:** Gol/asist sıralama (fdScorers), Tüm kadro görünümü (fdSquad)
- **Süper Lig özel davranışı** (`apiId === 203`):
  - `teamId = 0` olduğundan `loadForm()` ve `loadPlayers()` çalışmaz
  - `loadSLData()` çalışır: sonuçlardan form hesaplar, lig gol krallığını çeker
  - Sezon Analizi: "Bu lig için maç bazlı sezon analizi mevcut değil." mesajı gösterir
  - Oyuncular sekmesi: Lig geneli gol krallığı listesi gösterir (takıma özgü filtreleme mümkün değil — CollectAPI'de takım bilgisi yok)

---

## `services/api.ts` Fonksiyonları

```typescript
// Football-data.org
getStandings(leagueId: number)            // LEAGUE_MAP ile apiId → fdId dönüşümü
getTodayMatches(date?: string)
getLiveMatches()
getMatchStats(matchId: string)
getH2H(matchId: string)
getTeamForm(teamId: number)
getTopScorers(fdId: number)
getWeather(city: string)
getOdds(homeTeam, awayTeam, leagueApiId)

// API-Football
getAfLeagueTeams(leagueId, season?)
getAfTeamStats(leagueId, afTeamId, season?)
getAfTopScorers(leagueId, season?)
getAfTopAssists(leagueId, season?)
getAfSquad(afTeamId)
getFdTeamData(teamId)                     // football-data.org takım + kadro

// UCL
getUclKnockouts(season?)                  // default: 2025

// Süper Lig (CollectAPI)
getSuperLigStandings()
getSuperLigResults()
getSuperLigScorers()

// Yardımcılar
getCityForTeam(teamName: string): string  // TEAM_CITIES map'inden şehir döner
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

### Cache Key Versiyonlama
Cache'lenmiş boş veri sorunu yaşanırsa cache key'ine `_v2`, `_v3` gibi sürüm ekle.  
Mevcut sürümler:
- `standings_v3_{leagueId}`
- `af_topscorers_v2_{leagueId}_{season}`
- `af_leagueteams_v2_{leagueId}_{season}`
- `superlig_standings_v1`, `superlig_results_v1`, `superlig_scorers_v1`

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
| Süper Lig `teamId = 0` | CollectAPI takım ID'si sağlamıyor. Form/kadro/oyuncu istatistikleri bu ligde çalışmaz. |
| Süper Lig sonuçları (~1 hafta) | CollectAPI yalnızca son haftanın maç sonuçlarını verir. Form hesabı en fazla 1-2 maç gösterebilir. |
| Süper Lig gol krallığı — takım filtresi yok | CollectAPI gol krallığı verisinde takım bilgisi bulunmuyor. Oyuncular sekmesinde lig geneli liste gösterilir. |
| Serie A / Ligue 1 / UCL puan tablosu — ESPN'den | ESPN team ID'leri football-data.org ile örtüşmez. Bu liglerin takımlarında `teamId = 0`; form geçmişi ve oyuncu kadrosu çalışmaz. |
| API-Football kapalı | `RAPID_API_KEY` ayarlanmamış. `/af/` endpoint'leri boş döner. Önceki sezon takım detayları (kart, kale sıfır vb.) görünmez. |
| Süper Lig maç detayı yok | `index.tsx`'te `leagueApiId === 203` olan maçlara tıklamak detay sayfasına **gitmez**. |
| UCL puan tablosu — lig fazı bitti | Nisan 2026 itibarıyla UCL lig fazı bitti; puan tablosu son durumu gösterir, güncellenmez. |

---

## Geliştirme Ortamı

```bash
# Frontend başlat
cd C:\Users\umutn\Desktop\ScoutFootball
npx expo start

# TypeScript kontrolü
npx tsc --noEmit --skipLibCheck

# Backend push (Railway otomatik deploy eder)
cd ScoutFootball-Backend
git add server.js
git commit -m "..."
git push
```

Test: Expo Go uygulamasıyla QR kod taranır.

---

## Gelecekte Yapılabilecekler

- Oyuncu detay sayfası (profil + istatistikler)
- Favori takım/oyuncu sistemi
- Maç öncesi bildirimler
- Google Play yayını
- Hava sekmesi: o hava koşullarındaki takım performans geçmişi
- Profil ekranı (kullanıcı tercihleri)
- Süper Lig için daha kapsamlı bir API entegrasyonu (tam sezon maç geçmişi)
- API-Football (`RAPID_API_KEY`) aktifleştirilirse: takım detayları çok daha zengin hale gelir

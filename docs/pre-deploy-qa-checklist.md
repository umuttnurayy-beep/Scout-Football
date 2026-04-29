# ScoutFootball Pre-Deploy QA Checklist

Bu checklist, son değişikliklerde dokunulan ana ekran veri uyarıları, maç detay veri durumları ve ortak helper refactorları için hazırlanmıştır.

## Otomatik Kontroller

- [ ] `npx.cmd tsc --noEmit`
- [ ] `npm.cmd run lint`
- [ ] `npm.cmd run test:api-contract`
- [ ] `cd ScoutFootball-Backend && npm.cmd test`
- [ ] `cd ScoutFootball-Backend && npm.cmd run smoke:upstream` (`DIAGNOSTICS_SECRET` env ile)

## Ana Ekran

- [ ] Bugün sekmesi ilk açılışta maçları yüklerken alt tab bar sabit kalıyor.
- [ ] Tarih değiştirince `Veriler yenileniyor...` ve sağ üst güncelleme durumu yükleme bitince kapanıyor.
- [ ] Maç olan gün gerçek maç listesi gösteriliyor.
- [ ] Maç olmayan gün boş ekran ve sonraki öne çıkan maç kartı düzgün görünüyor.
- [ ] Tek maç olan gün tek maç özel görünümü, H2H ve trend alanları taşma yapmadan görünüyor.
- [ ] API verisi yenilenemezse ana ekranda cache/sınırlı kaynak uyarısı çıkıyor.
- [ ] Gerçekten maç yoksa API hatası gibi görünmüyor.

## Normal Lig Maç Detayı

- [ ] Scout özeti, Scout Pick, radar grafiği ve takım karşılaştırması aynı maç profiline işaret ediyor.
- [ ] Performans verisi yokken açıklama `yeterli veri bulunamadı` mantığıyla geliyor.
- [ ] API/form kaynağı hata verirse açıklama `şu an yenilenemedi` mantığıyla geliyor.
- [ ] Oran hiç yayınlanmadıysa `henüz yayınlanmadı` mesajı çıkıyor.
- [ ] Daha önce görünen oran sağlayıcı tarafında boş dönerse hata mesajı geçici kaynak problemi gibi anlatılıyor.
- [ ] Hava durumu yoksa maç detay sayfası kırılmadan ilgili boş state gösteriliyor.
- [ ] H2H yoksa geçmiş veri yok mesajı, H2H endpoint hatasında yenilenemedi mesajı gösteriliyor.
- [ ] Radar grafiği iki takım için dolu, hizalı ve taşmadan görünüyor.

## Süper Lig Maç Detayı

- [ ] Süper Lig takım context verisi gelirse form ve karşılaştırma alanları doluyor.
- [ ] Maç bazlı veri sınırlıysa sezon tablosu fallback uyarısı görünüyor.
- [ ] Standings fallback kullanılırken iç/dış saha alanı yanıltıcı şekilde gösterilmiyor.
- [ ] H2H, hava ve maç karakteri boş state mesajları normal maç detayıyla aynı tonda.
- [ ] Radar grafiği normal lig detayındaki mantıkla aynı çalışıyor.

## UI Tutarlılık

- [ ] `Stil / Gol / Tempo / Risk / Güven` yardım metinleri iki detay sayfasında aynı.
- [ ] Boş veri kutuları iki detay sayfasında aynı spacing ve tipografiyle görünüyor.
- [ ] Stale/sınırlı veri bannerları ekranda üst içerikle çakışmıyor.
- [ ] Uzun takım adlarında radar legend, karşılaştırma başlığı ve oran kutuları taşmıyor.

## Riskli Senaryolar

- [ ] Football-Data veya SportsDB kısa süreli hata verdiğinde ekran komple boşalmıyor.
- [ ] Odds endpoint geçici boş döndüğünde eski veri kaybolmuş gibi panik mesajı gösterilmiyor.
- [ ] Hava endpoint hata verdiğinde Scout özeti ve diğer analizler çalışmaya devam ediyor.
- [ ] Süper Lig form verisi az olduğunda kullanıcıya net sınırlı veri uyarısı veriliyor.
- [ ] Cache/stale veri kullanılıyorsa kullanıcıya bunun güncel canlı veri olmadığı anlatılıyor.

## Deploy Öncesi Son Kontrol

- [ ] `git status --short` ile yeni dosyaların commit kapsamına dahil olduğu doğrulandı.
- [ ] Railway deploy kuyruğu normal durumda.
- [ ] Production `/health` endpoint'i `ok` dönüyor.
- [ ] Production smoke testi gerekiyorsa backend smoke scriptleri prod URL ile çalıştırıldı.

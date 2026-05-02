export function matchListEmptyMessage(activeFilter: string): string {
  if (activeFilter !== 'Scout') {
    return `${activeFilter} için maç bulunamadı. Seçili tarihte bu ligde maç olmayabilir veya veri sağlayıcı henüz programı yayınlamamış olabilir.`;
  }
  return 'Bu tarihte maç bulunamadı. Farklı bir tarih seçebilir veya daha sonra tekrar güncelleyebilirsin.';
}

export function leagueDataEmptyMessage(leagueName: string): string {
  return `${leagueName} verisi yüklenemedi. Veri sağlayıcı geçici olarak yanıt vermiyor olabilir; birkaç dakika sonra yeniden denemek iyi olur.`;
}

export function teamDataEmptyMessage(leagueName: string): string {
  return `${leagueName} için takım verisi alınamadı. Puan tablosu kaynağı boş döndü veya geçici olarak erişilemiyor.`;
}

export function formDataEmptyMessage(): string {
  return 'Form verisi bulunamadı. Bu takım için son maç bilgisi sağlayıcıda eksik olabilir.';
}

export type DetailDataKind =
  | 'performance'
  | 'comparison'
  | 'form'
  | 'homeAway'
  | 'prediction'
  | 'odds'
  | 'weather'
  | 'h2h'
  | 'character';

export type DetailDataState = 'sourceError' | 'empty' | 'notPublished';

const DETAIL_DATA_MESSAGES: Record<DetailDataKind, Record<DetailDataState, string>> = {
  performance: {
    sourceError: 'Performans verisi şu an yenilenemedi; analiz son güvenilir kaynaklarla sınırlı tutuluyor.',
    empty: 'Bu maç için yeterli performans verisi bulunamadı.',
    notPublished: 'Performans verisi henüz yayınlanmadı.',
  },
  comparison: {
    sourceError: 'Takım karşılaştırma verisi şu an yenilenemedi.',
    empty: 'Bu maç için yeterli karşılaştırma verisi bulunamadı.',
    notPublished: 'Takım karşılaştırma verisi henüz yayınlanmadı.',
  },
  form: {
    sourceError: 'Form verisi şu an yenilenemedi; son maç trendi temkinli okunmalı.',
    empty: 'Bu maç için yeterli form verisi bulunamadı.',
    notPublished: 'Form verisi henüz yayınlanmadı.',
  },
  homeAway: {
    sourceError: 'İç saha / deplasman verisi şu an yenilenemedi.',
    empty: 'İç saha / deplasman ayrımı için yeterli veri bulunamadı.',
    notPublished: 'İç saha / deplasman verisi henüz yayınlanmadı.',
  },
  prediction: {
    sourceError: 'Tahmin için gerekli form verisi şu an yenilenemedi.',
    empty: 'Tahmin için yeterli form verisi bulunamadı.',
    notPublished: 'Tahmin verisi henüz yayınlanmadı.',
  },
  odds: {
    sourceError: 'Oran verisi şu an yenilenemedi; daha önce görünen oran sağlayıcı tarafında geçici olarak boş dönmüş olabilir.',
    empty: 'Bu maç için oran verisi bulunamadı.',
    notPublished: 'Bu maç için oran verisi henüz yayınlanmadı.',
  },
  weather: {
    sourceError: 'Hava durumu verisi şu an yenilenemedi.',
    empty: 'Hava durumu verisi alınamadı.',
    notPublished: 'Hava durumu verisi maç saatine yakın netleşebilir.',
  },
  h2h: {
    sourceError: 'H2H verisi şu an yenilenemedi.',
    empty: 'Geçmiş karşılaşma verisi bulunamadı.',
    notPublished: 'Geçmiş karşılaşma verisi henüz yayınlanmadı.',
  },
  character: {
    sourceError: 'Maç karakteri için form verisi şu an yenilenemedi.',
    empty: 'Maç karakteri için yeterli form verisi bulunamadı.',
    notPublished: 'Maç karakteri verisi henüz yayınlanmadı.',
  },
};

export function detailDataMessage(kind: DetailDataKind, state: DetailDataState): string {
  return DETAIL_DATA_MESSAGES[kind][state];
}

export function staleAnalysisMessage(): string {
  return 'Bazı veri kaynakları şu anda yenilenemedi. Ekrandaki analiz son başarılı verilerle hazırlanıyor; bu yüzden yorumları güncel canlı veri gibi değil, sınırlı kaynak notuyla okumak daha doğru.';
}

export function dataNoticeMessage(type: 'stale' | 'cache' | 'warning' | 'error'): string {
  if (type === 'stale') {
    return 'Sunucu güncel veriyi hazırlayamadı; ekranda son başarılı sunucu yanıtı gösteriliyor.';
  }
  if (type === 'cache') {
    return 'Sunucuya ulaşılamadı; ekranda bu cihazdaki son kayıtlı maç verisi gösteriliyor.';
  }
  if (type === 'warning') {
    return 'Bazı yardımcı veri kaynakları sınırlı çalışıyor; ana maç listesi mevcut ama bazı karşılaştırmalar eksik olabilir.';
  }
  return 'Veri şu an alınamadı. Ekrandaki bilgiler eski cache veya sınırlı kaynakla yüklenmiş olabilir.';
}

export function summarizeSourceWarnings(
  warnings: string[] | undefined,
  severity?: 'warning' | 'error' | null,
): string | null {
  const items = Array.isArray(warnings)
    ? warnings.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  if (items.length === 0) return null;

  const joined = items.join(' ').toLowerCase();
  if (joined.includes('super lig')) {
    return 'Süper Lig kaynağı şu an sınırlı çalışıyor; bazı kartlar eksik veya gecikmeli görünebilir.';
  }
  if (joined.includes('standings')) {
    return severity === 'warning'
      ? 'Puan tablosu kaynağı şu an sınırlı çalışıyor; ana maç listesi görünse de bazı sıralama karşılaştırmaları eksik kalabilir.'
      : 'Puan tablosu kaynağı şu an sınırlı çalışıyor; bazı sıralama karşılaştırmaları eksik kalabilir.';
  }
  if (joined.includes('main match feed')) {
    return 'Ana maç kaynağı şu an sınırlı çalışıyor; bazı maçlar geç yüklenebilir.';
  }

  return 'Bazı veri kaynakları şu an sınırlı çalışıyor; ekrandaki içerik kısmi veriyle hazırlanmış olabilir.';
}

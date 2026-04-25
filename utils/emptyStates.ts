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

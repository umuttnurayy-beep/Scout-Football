export function matchListEmptyMessage(activeFilter: string): string {
  if (activeFilter !== 'Scout') {
    return `${activeFilter} iÃ§in maÃ§ bulunamadÄ±. SeÃ§ili tarihte bu ligde maÃ§ olmayabilir veya veri saÄŸlayÄ±cÄ± henÃ¼z programÄ± yayÄ±nlamamÄ±ÅŸ olabilir.`;
  }
  return 'Bu tarihte maÃ§ bulunamadÄ±. FarklÄ± bir tarih seÃ§ebilir veya daha sonra tekrar gÃ¼ncelleyebilirsin.';
}

export function leagueDataEmptyMessage(leagueName: string): string {
  return `${leagueName} verisi yÃ¼klenemedi. Veri saÄŸlayÄ±cÄ± geÃ§ici olarak yanÄ±t vermiyor olabilir; birkaÃ§ dakika sonra yeniden denemek iyi olur.`;
}

export function teamDataEmptyMessage(leagueName: string): string {
  return `${leagueName} iÃ§in takÄ±m verisi alÄ±namadÄ±. Puan tablosu kaynaÄŸÄ± boÅŸ dÃ¶ndÃ¼ veya geÃ§ici olarak eriÅŸilemiyor.`;
}

export function formDataEmptyMessage(): string {
  return 'Form verisi bulunamadÄ±. Bu takÄ±m iÃ§in son maÃ§ bilgisi saÄŸlayÄ±cÄ±da eksik olabilir.';
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
    sourceError: 'Performans verisi ÅŸu an yenilenemedi; analiz son gÃ¼venilir kaynaklarla sÄ±nÄ±rlÄ± tutuluyor.',
    empty: 'Bu maÃ§ iÃ§in yeterli performans verisi bulunamadÄ±.',
    notPublished: 'Performans verisi henÃ¼z yayÄ±nlanmadÄ±.',
  },
  comparison: {
    sourceError: 'TakÄ±m karÅŸÄ±laÅŸtÄ±rma verisi ÅŸu an yenilenemedi.',
    empty: 'Bu maÃ§ iÃ§in yeterli karÅŸÄ±laÅŸtÄ±rma verisi bulunamadÄ±.',
    notPublished: 'TakÄ±m karÅŸÄ±laÅŸtÄ±rma verisi henÃ¼z yayÄ±nlanmadÄ±.',
  },
  form: {
    sourceError: 'Form verisi ÅŸu an yenilenemedi; son maÃ§ trendi temkinli okunmalÄ±.',
    empty: 'Bu maÃ§ iÃ§in yeterli form verisi bulunamadÄ±.',
    notPublished: 'Form verisi henÃ¼z yayÄ±nlanmadÄ±.',
  },
  homeAway: {
    sourceError: 'Ä°Ã§ saha / deplasman verisi ÅŸu an yenilenemedi.',
    empty: 'Ä°Ã§ saha / deplasman ayrÄ±mÄ± iÃ§in yeterli veri bulunamadÄ±.',
    notPublished: 'Ä°Ã§ saha / deplasman verisi henÃ¼z yayÄ±nlanmadÄ±.',
  },
  prediction: {
    sourceError: 'Tahmin iÃ§in gerekli form verisi ÅŸu an yenilenemedi.',
    empty: 'Tahmin iÃ§in yeterli form verisi bulunamadÄ±.',
    notPublished: 'Tahmin verisi henÃ¼z yayÄ±nlanmadÄ±.',
  },
  odds: {
    sourceError: 'Oran verisi ÅŸu an yenilenemedi; daha Ã¶nce gÃ¶rÃ¼nen oran saÄŸlayÄ±cÄ± tarafÄ±nda geÃ§ici olarak boÅŸ dÃ¶nmÃ¼ÅŸ olabilir.',
    empty: 'Bu maÃ§ iÃ§in oran verisi bulunamadÄ±.',
    notPublished: 'Bu maÃ§ iÃ§in oran verisi henÃ¼z yayÄ±nlanmadÄ±.',
  },
  weather: {
    sourceError: 'Hava durumu verisi ÅŸu an yenilenemedi.',
    empty: 'Hava durumu verisi alÄ±namadÄ±.',
    notPublished: 'Hava durumu verisi maÃ§ saatine yakÄ±n netleÅŸebilir.',
  },
  h2h: {
    sourceError: 'H2H verisi ÅŸu an yenilenemedi.',
    empty: 'GeÃ§miÅŸ karÅŸÄ±laÅŸma verisi bulunamadÄ±.',
    notPublished: 'GeÃ§miÅŸ karÅŸÄ±laÅŸma verisi henÃ¼z yayÄ±nlanmadÄ±.',
  },
  character: {
    sourceError: 'MaÃ§ karakteri iÃ§in form verisi ÅŸu an yenilenemedi.',
    empty: 'MaÃ§ karakteri iÃ§in yeterli form verisi bulunamadÄ±.',
    notPublished: 'MaÃ§ karakteri verisi henÃ¼z yayÄ±nlanmadÄ±.',
  },
};

export function detailDataMessage(kind: DetailDataKind, state: DetailDataState): string {
  return DETAIL_DATA_MESSAGES[kind][state];
}

export function staleAnalysisMessage(): string {
  return 'BazÄ± veri kaynaklarÄ± ÅŸu anda yenilenemedi. Ekrandaki analiz son baÅŸarÄ±lÄ± verilerle hazÄ±rlanÄ±yor; bu yÃ¼zden yorumlarÄ± gÃ¼ncel canlÄ± veri gibi deÄŸil, sÄ±nÄ±rlÄ± kaynak notuyla okumak daha doÄŸru.';
}

export function dataNoticeMessage(type: 'stale' | 'warning' | 'error'): string {
  if (type === 'stale') {
    return 'Veri kaynaÄŸÄ± yenilenemedi; ekranda son baÅŸarÄ±lÄ± maÃ§ verisi gÃ¶steriliyor.';
  }
  if (type === 'warning') {
    return 'BazÄ± yardÄ±mcÄ± veri kaynaklarÄ± sÄ±nÄ±rlÄ± Ã§alÄ±ÅŸÄ±yor; ana maÃ§ listesi mevcut ama bazÄ± karÅŸÄ±laÅŸtÄ±rmalar eksik olabilir.';
  }
  return 'Veri ÅŸu an alÄ±namadÄ±. Ekrandaki bilgiler eski cache veya sÄ±nÄ±rlÄ± kaynakla yÃ¼klenmiÅŸ olabilir.';
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
    return 'SÃ¼per Lig kaynaÄŸÄ± ÅŸu an sÄ±nÄ±rlÄ± Ã§alÄ±ÅŸÄ±yor; bazÄ± kartlar eksik veya gecikmeli gÃ¶rÃ¼nebilir.';
  }
  if (joined.includes('standings')) {
    return severity === 'warning'
      ? 'Puan tablosu kaynaÄŸÄ± ÅŸu an sÄ±nÄ±rlÄ± Ã§alÄ±ÅŸÄ±yor; ana maÃ§ listesi gÃ¶rÃ¼nse de bazÄ± sÄ±ralama karÅŸÄ±laÅŸtÄ±rmalarÄ± eksik kalabilir.'
      : 'Puan tablosu kaynaÄŸÄ± ÅŸu an sÄ±nÄ±rlÄ± Ã§alÄ±ÅŸÄ±yor; bazÄ± sÄ±ralama karÅŸÄ±laÅŸtÄ±rmalarÄ± eksik kalabilir.';
  }
  if (joined.includes('main match feed')) {
    return 'Ana maÃ§ kaynaÄŸÄ± ÅŸu an sÄ±nÄ±rlÄ± Ã§alÄ±ÅŸÄ±yor; bazÄ± maÃ§lar geÃ§ yÃ¼klenebilir.';
  }

  return 'BazÄ± veri kaynaklarÄ± ÅŸu an sÄ±nÄ±rlÄ± Ã§alÄ±ÅŸÄ±yor; ekrandaki iÃ§erik kÄ±smi veriyle hazÄ±rlanmÄ±ÅŸ olabilir.';
}

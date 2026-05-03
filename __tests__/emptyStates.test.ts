import {
  dataNoticeMessage,
  detailDataMessage,
  formDataEmptyMessage,
  leagueDataEmptyMessage,
  matchListEmptyMessage,
  staleAnalysisMessage,
  summarizeSourceWarnings,
  teamDataEmptyMessage,
} from '../utils/emptyStates';

describe('dataNoticeMessage', () => {
  it('distinguishes server stale data from local device cache', () => {
    const stale = dataNoticeMessage('stale');
    const cache = dataNoticeMessage('cache');

    expect(stale).toContain('son başarılı sunucu yanıtı');
    expect(cache).toContain('bu cihazdaki son kayıtlı maç verisi');
    expect(stale).not.toBe(cache);
  });

  it('keeps warning and error notices user-facing', () => {
    expect(dataNoticeMessage('warning')).toContain('yardımcı veri kaynakları');
    expect(dataNoticeMessage('error')).toContain('Veri şu an alınamadı');
  });
});

describe('empty state copy helpers', () => {
  it('tailors empty match copy by active filter', () => {
    expect(matchListEmptyMessage('Scout')).toContain('Bu tarihte');
    expect(matchListEmptyMessage('Premier Lig')).toContain('Premier Lig');
  });

  it('includes league context in league and team empty messages', () => {
    expect(leagueDataEmptyMessage('Serie A')).toContain('Serie A');
    expect(teamDataEmptyMessage('Süper Lig')).toContain('Süper Lig');
    expect(formDataEmptyMessage()).toContain('Form');
  });

  it('covers detail data messages for key states', () => {
    expect(detailDataMessage('odds', 'notPublished')).toContain('oran');
    expect(detailDataMessage('weather', 'sourceError')).toContain('Hava');
    expect(detailDataMessage('character', 'empty')).toContain('karakteri');
  });

  it('keeps stale analysis copy explicit', () => {
    expect(staleAnalysisMessage()).toContain('son başarılı veriler');
  });
});

describe('summarizeSourceWarnings', () => {
  it('returns null for empty or invalid warning lists', () => {
    expect(summarizeSourceWarnings(undefined)).toBeNull();
    expect(summarizeSourceWarnings(['', '   '])).toBeNull();
  });

  it('summarizes known source warning categories', () => {
    expect(summarizeSourceWarnings(['super lig feed timeout'])).toContain('Süper Lig');
    expect(summarizeSourceWarnings(['standings api timeout'], 'warning')).toContain('ana maç listesi');
    expect(summarizeSourceWarnings(['standings api timeout'], 'error')).not.toContain('ana maç listesi');
    expect(summarizeSourceWarnings(['main match feed timeout'])).toContain('Ana maç');
  });

  it('falls back to a generic partial-data warning', () => {
    expect(summarizeSourceWarnings(['odds provider slow'])).toContain('kısmi veri');
  });
});

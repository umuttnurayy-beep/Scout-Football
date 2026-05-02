import { dataNoticeMessage } from '../utils/emptyStates';

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

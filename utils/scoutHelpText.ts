export type ScoutHelpKey = 'stil' | 'gol' | 'tempo' | 'risk' | 'guven';

export const SCOUT_HELP: Record<ScoutHelpKey, { title: string; body: string }> = {
  stil: {
    title: 'Stil',
    body: 'Maçın genel karakterini anlatır: daha hücumcu, savunmacı veya dengeli bir oyun beklenip beklenmediğini özetler.',
  },
  gol: {
    title: 'Gol',
    body: 'Maçın gol üretme potansiyelini gösterir. Takımların son dönem gol ve savunma profili birlikte okunur.',
  },
  tempo: {
    title: 'Tempo',
    body: 'Oyunun akış hızını anlatır. Pozisyon sıklığı, form ritmi ve maçın kopma ihtimali için kısa bir sinyaldir.',
  },
  risk: {
    title: 'Risk',
    body: 'Maçın ne kadar açık okunabildiğini gösterir. Değer yükseldikçe sonuç tarafında temkinli olmak gerekir.',
  },
  guven: {
    title: 'Güven',
    body: 'Scout yorumunun veri desteğini gösterir. Yüksekse özet daha sağlam sinyallere dayanır.',
  },
};

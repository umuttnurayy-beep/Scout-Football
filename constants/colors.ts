export type ThemeColors = {
  // Arka planlar
  bg: string;           // sayfa arka planı
  surface: string;      // kart, topbar, tabbar
  surfaceAlt: string;   // ikincil yüzey (picker header, settings)
  surfaceRaised: string;// hafif yükseltilmiş kart

  // Kenarlıklar
  border: string;       // ana kenarlık
  borderLight: string;  // ince/subtle kenarlık

  // Metinler
  text: string;         // birincil metin
  textSub: string;      // ikincil metin
  textMuted: string;    // soluk metin (etiketler)
  textFaint: string;    // çok soluk
  textVeryFaint: string;// neredeyse görünmez

  // Marka renkleri
  primary: string;      // #185FA5 / dark: #58A6FF
  primaryDark: string;  // #0C447C
  primaryLight: string; // açık mavi arka plan

  // Kart kenarlıkları
  cardBorder: string;

  // Durum renkleri
  win: string;
  draw: string;
  loss: string;
  amber: string;    // uyarı / orta seviye göstergesi
};

export const lightColors: ThemeColors = {
  bg:             '#F8F9FB',
  surface:        '#ffffff',
  surfaceAlt:     '#f8f8f8',
  surfaceRaised:  '#ffffff',

  border:         '#eeeeee',
  borderLight:    '#f0f0f0',

  text:           '#111111',
  textSub:        '#555555',
  textMuted:      '#888888',
  textFaint:      '#aaaaaa',
  textVeryFaint:  '#cccccc',

  primary:        '#185FA5',
  primaryDark:    '#0C447C',
  primaryLight:   '#E6F1FB',

  cardBorder:     '#E4EEF8',

  win:  '#27AE60',
  draw: '#888888',
  loss: '#C0392B',
  amber: '#B7791F',
};

export const darkColors: ThemeColors = {
  bg:             '#0D1117',
  surface:        '#161B22',
  surfaceAlt:     '#1C2128',
  surfaceRaised:  '#21262D',

  border:         '#30363D',
  borderLight:    '#21262D',

  text:           '#E6EDF3',
  textSub:        '#B1BAC4',
  textMuted:      '#8B949E',
  textFaint:      '#6E7681',
  textVeryFaint:  '#484F58',

  primary:        '#58A6FF',
  primaryDark:    '#1F6FEB',
  primaryLight:   '#0D2F4F',

  cardBorder:     '#1D3043',

  win:  '#3FB950',
  draw: '#6E7681',
  loss: '#F85149',
  amber: '#E3B341',
};

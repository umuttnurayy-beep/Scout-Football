// Single source of truth for layout spacing used across screens.
// Update here to apply consistently everywhere.

export const SP = {
  // Section label (e.g. "MAÇ İSTATİSTİKLERİ")
  sectionPt: 14,   // paddingTop
  sectionPb: 6,    // paddingBottom
  sectionPx: 14,   // paddingHorizontal

  // Insight / narrative box (left-accent card)
  insightMx: 14,   // marginHorizontal
  insightMb: 10,   // marginBottom
  insightP:  11,   // padding
  insightR:  8,    // borderRadius
  insightBw: 3,    // borderLeftWidth

  // Generic card
  cardPx: 14,      // paddingHorizontal
  cardPy: 12,      // paddingVertical
  cardR:  10,      // borderRadius
  cardMb: 10,      // marginBottom between cards

  pillR:  20,      // badge / pill borderRadius
  rowGap: 8,       // default flex row gap
} as const;

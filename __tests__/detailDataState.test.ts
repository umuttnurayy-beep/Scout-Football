import React from 'react';
import { DetailDataNotice, DetailInsightBox, DetailSectionTitle } from '../components/DetailDataState';

const colors = {
  primary: '#185FA5',
  primaryLight: '#EAF3FF',
  surfaceAlt: '#F5F7FA',
  text: '#111827',
  textMuted: '#6B7280',
  textSub: '#374151',
};

jest.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors, isDark: false }),
}));

describe('DetailDataState components', () => {
  it('applies themed defaults to data notices', () => {
    const notice = DetailDataNotice({ message: 'Veri yok' });
    const text = notice.props.children;

    expect(notice.props.style[0]).toEqual({ backgroundColor: colors.surfaceAlt });
    expect(text.props.children).toBe('Veri yok');
    expect(text.props.style[0]).toEqual({ color: colors.textSub });
  });

  it('centralizes section title color while preserving caller styles', () => {
    const title = DetailSectionTitle({
      children: 'TAKIM KARŞILAŞTIRMASI',
      style: { fontSize: 11, paddingHorizontal: 14 },
    });

    expect(title.props.children).toBe('TAKIM KARŞILAŞTIRMASI');
    expect(title.props.style).toEqual([
      { color: colors.textMuted },
      { fontSize: 11, paddingHorizontal: 14 },
    ]);
  });

  it('applies default and accent insight styles', () => {
    const insight = DetailInsightBox({ message: 'Form yorumu' });
    const text = insight.props.children;

    expect(insight.props.style[0]).toEqual({
      backgroundColor: colors.primaryLight,
      borderLeftColor: colors.primary,
    });
    expect(text.props.children).toBe('Form yorumu');
    expect(text.props.style[0]).toEqual({ color: colors.text });

    const accent = DetailInsightBox({
      message: 'Motivasyon',
      accentColor: '#E6A817',
      textColor: '#7A5700',
      boxStyle: { marginTop: 0 },
      textStyle: { fontWeight: '600' },
    });
    const accentText = accent.props.children;

    expect(accent.props.style).toEqual([
      { backgroundColor: colors.primaryLight, borderLeftColor: '#E6A817' },
      { marginTop: 0 },
    ]);
    expect(accentText.props.style).toEqual([
      { color: '#7A5700' },
      { fontWeight: '600' },
    ]);
  });

  it('renders custom children when no message is provided', () => {
    const child = React.createElement('Text', { testID: 'child' }, 'Etki');
    const insight = DetailInsightBox({ children: child });

    expect(insight.props.children).toBe(child);
  });
});

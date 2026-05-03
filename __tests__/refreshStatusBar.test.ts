import RefreshStatusBar, { REFRESH_STATUS_MESSAGES } from '../components/RefreshStatusBar';

const colors = {
  primary: '#185FA5',
  surface: '#FFFFFF',
  borderLight: '#E5E7EB',
  textSub: '#374151',
};

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors, isDark: false }),
}));

describe('RefreshStatusBar', () => {
  it('exports shared refresh messages for screens', () => {
    expect(REFRESH_STATUS_MESSAGES).toEqual({
      default: 'Veriler yenileniyor...',
      matches: 'Maç verileri yenileniyor...',
      leagues: 'Lig verileri yenileniyor...',
    });
  });

  it('renders the default message with themed shell styles', () => {
    const bar = RefreshStatusBar({});
    const [spinner, text] = bar.props.children;

    expect(bar.props.style[1]).toEqual({
      backgroundColor: colors.surface,
      borderTopColor: colors.borderLight,
      borderBottomColor: colors.borderLight,
    });
    expect(spinner.props).toMatchObject({ size: 'small', color: colors.primary });
    expect(text.props.children).toBe(REFRESH_STATUS_MESSAGES.default);
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.style[1]).toEqual({ color: colors.textSub });
  });

  it('renders a screen-specific message when provided', () => {
    const bar = RefreshStatusBar({ message: REFRESH_STATUS_MESSAGES.matches });
    const text = bar.props.children[1];

    expect(text.props.children).toBe('Maç verileri yenileniyor...');
  });
});

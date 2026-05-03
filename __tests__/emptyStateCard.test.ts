import EmptyStateCard from '../components/EmptyStateCard';

const colors = {
  primary: '#185FA5',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111827',
  textSub: '#374151',
};

jest.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors, isDark: false }),
}));

describe('EmptyStateCard', () => {
  it('renders full empty state with centered stable spacing', () => {
    const retry = jest.fn();
    const card = EmptyStateCard({
      icon: '📡',
      title: 'Veri yüklenemedi',
      subtitle: 'Lütfen tekrar dene.',
      onRetry: retry,
    });
    const [icon, title, subtitle, retryButton] = card.props.children;

    expect(card.props.style).toMatchObject({
      minHeight: 260,
      alignItems: 'center',
      justifyContent: 'center',
    });
    expect(icon.props.children).toBe('📡');
    expect(title.props.children).toBe('Veri yüklenemedi');
    expect(title.props.style[1]).toEqual({ color: colors.text });
    expect(subtitle.props.children).toBe('Lütfen tekrar dene.');
    expect(subtitle.props.style[1]).toEqual({ color: colors.textSub });
    expect(retryButton.props.onPress).toBe(retry);
    expect(retryButton.props.style[1]).toEqual({ backgroundColor: colors.primary });
    expect(retryButton.props.children[0].props).toMatchObject({ name: 'refresh', color: '#fff' });
    expect(retryButton.props.children[1].props.children).toBe('Tekrar Dene');
  });

  it('renders compact retry without allowing the label to wrap', () => {
    const retry = jest.fn();
    const card = EmptyStateCard({
      compact: true,
      icon: '⚽',
      title: 'Gol verisi bulunamadı',
      retryLabel: 'Yeniden Yükle',
      onRetry: retry,
    });
    const retryButton = card.props.children[2];
    const retryLabel = retryButton.props.children[1];

    expect(card.props.style[1]).toEqual({ backgroundColor: '#F7F9FC', borderColor: colors.border });
    expect(retryButton.props.onPress).toBe(retry);
    expect(retryButton.props.style[1]).toEqual({ borderColor: colors.primary });
    expect(retryButton.props.children[0].props).toMatchObject({ name: 'refresh', color: colors.primary });
    expect(retryLabel.props.children).toBe('Yeniden Yükle');
    expect(retryLabel.props.numberOfLines).toBe(1);
  });

  it('omits retry controls when no retry handler is provided', () => {
    const full = EmptyStateCard({ icon: '🏆', title: 'Veri yok' });
    const compact = EmptyStateCard({ compact: true, icon: '🏆', title: 'Veri yok' });

    expect(full.props.children[3]).toBeNull();
    expect(compact.props.children[2]).toBeNull();
  });
});

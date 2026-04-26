import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { ThemeColors, darkColors, lightColors } from '../constants/colors';

const THEME_KEY = 'scout_theme_mode'; // 'light' | 'dark' | 'system'
const AUTO_LIGHT_START_HOUR = 7;
const AUTO_DARK_START_HOUR = 20;

type ThemeMode = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
  mode: 'system',
  setMode: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(val => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setModeState(val);
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (mode !== 'system') return;
    const id = setInterval(() => setClockTick(t => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, [mode]);

  function isAutoDark() {
    const hour = new Date().getHours();
    return hour >= AUTO_DARK_START_HOUR || hour < AUTO_LIGHT_START_HOUR;
  }

  const isDark =
    mode === 'dark' ? true :
    mode === 'light' ? false :
    isAutoDark();

  const colors = isDark ? darkColors : lightColors;

  async function setMode(m: ThemeMode) {
    setModeState(m);
    await AsyncStorage.setItem(THEME_KEY, m);
  }

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ colors, isDark, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

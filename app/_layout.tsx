import { Stack } from "expo-router";
import { ThemeProvider } from "../context/ThemeContext";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="leagues" options={{ headerShown: false }} />
        <Stack.Screen name="match_detail" options={{ headerShown: false }} />
        <Stack.Screen name="stats" options={{ headerShown: false }} />
        <Stack.Screen name="team_detail" options={{ headerShown: false }} />
        <Stack.Screen name="team_stats" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="sl_match_detail" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.c.bg },
        animation: 'slide_from_right',
      }}
    />
  );
}

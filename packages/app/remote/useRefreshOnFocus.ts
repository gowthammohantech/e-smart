import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { refreshOnFocus } from './sync';

/** Pulls from the server when the screen comes into view, if online. */
export function useRefreshOnFocus() {
  useFocusEffect(useCallback(() => refreshOnFocus(), []));
}

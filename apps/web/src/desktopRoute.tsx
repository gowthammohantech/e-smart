import React from 'react';
import { useIsDesktop } from './layout';

/**
 * A route that shows `Desktop` in a desktop browser window and the shared
 * (phone) screen otherwise. The phone screen is never changed or wrapped.
 */
export function desktopRoute(Phone: React.ComponentType, Desktop: React.ComponentType) {
  return function DesktopRoute() {
    return useIsDesktop() ? <Desktop /> : <Phone />;
  };
}

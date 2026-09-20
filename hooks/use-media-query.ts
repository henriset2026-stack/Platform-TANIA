"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query.
 *
 * Uses useSyncExternalStore rather than useEffect + setState: a media query
 * list is an external store, and syncing it through an effect causes the
 * cascading render the React Compiler lint rule flags.
 *
 * Returns false on the server so SSR and first client paint agree.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tailwind `lg` breakpoint. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

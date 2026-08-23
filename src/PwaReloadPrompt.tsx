import { useEffect, useState, useRef, useCallback } from 'react';
import styled from 'styled-components';

const Banner = styled.div`
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #1e293b;
  color: #f8fafc;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  font-size: 0.9rem;
`;

const ReloadButton = styled.button`
  padding: 6px 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;

  &:hover {
    background: #2563eb;
  }
`;

const DismissButton = styled.button`
  padding: 6px 12px;
  background: transparent;
  color: #cbd5e1;
  border: 1px solid #475569;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;

  &:hover {
    color: white;
    border-color: #94a3b8;
  }
`;

type UpdateSW = (reloadPage?: boolean) => Promise<void>;

// How often to poll for a new service worker while the app is left open in
// the background. The browser only checks for updates on its own when the
// service worker registration happens (roughly on load/navigation), so a
// long-lived SPA tab needs to trigger this itself to notice new deploys.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export default function PwaReloadPrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateSWRef = useRef<UpdateSW | undefined>(undefined);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

  const handleReload = useCallback(async () => {
    await updateSWRef.current?.();
  }, []);

  const handleDismiss = useCallback(() => {
    setNeedRefresh(false);
    setOfflineReady(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Checking for an update fetches the service worker script over the
    // network. Skip it entirely while offline so this never throws or
    // interferes with offline use — the app keeps working from the
    // existing cached service worker/assets regardless.
    function checkForUpdate() {
      if (!navigator.onLine) return;
      registrationRef.current?.update().catch(() => {
        // Ignore transient failures (flaky connection, captive portal,
        // browser tab suspended, etc). We'll just try again next interval.
      });
    }

    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh() {
            if (!cancelled) setNeedRefresh(true);
          },
          onOfflineReady() {
            if (!cancelled) setOfflineReady(true);
          },
          onRegisteredSW(_url, registration) {
            registrationRef.current = registration;
          },
        });
        updateSWRef.current = updateSW;
      })
      .catch(() => {
        // PWA registration is not available in test/non-Vite environments.
      });

    const intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    // Also check immediately whenever connectivity is restored, so a user
    // who opened the app offline finds out about an update as soon as
    // they're back online rather than waiting for the next interval tick.
    window.addEventListener('online', checkForUpdate);

    // On mobile, the app is frequently paused/restored instead of reloaded.
    // Check when the user returns to it (tab becomes visible or window gets
    // focus) so the prompt can appear quickly after a new build is deployed.
    function handleVisibilityOrFocus() {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('online', checkForUpdate);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, []);

  if (!needRefresh && !offlineReady) return null;

  return (
    <Banner role="status" aria-live="polite" data-testid="pwa-reload-prompt">
      <span>{needRefresh ? 'An update is available.' : 'App ready to work offline.'}</span>
      {needRefresh && (
        <>
          <ReloadButton onClick={handleReload}>Reload</ReloadButton>
          <DismissButton onClick={handleDismiss}>Later</DismissButton>
        </>
      )}
      {offlineReady && <DismissButton onClick={handleDismiss}>OK</DismissButton>}
    </Banner>
  );
}

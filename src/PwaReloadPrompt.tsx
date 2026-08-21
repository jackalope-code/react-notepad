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

export default function PwaReloadPrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateSWRef = useRef<UpdateSW | undefined>(undefined);

  const handleReload = useCallback(async () => {
    await updateSWRef.current?.();
  }, []);

  const handleDismiss = useCallback(() => {
    setNeedRefresh(false);
    setOfflineReady(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
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
        });
        updateSWRef.current = updateSW;
      })
      .catch(() => {
        // PWA registration is not available in test/non-Vite environments.
      });
    return () => {
      cancelled = true;
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

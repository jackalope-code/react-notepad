import styled from 'styled-components';

const Bar = styled.div`
  background: #fef3c7;
  border-bottom: 1px solid #f59e0b;
  padding: 6px 12px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ErrorBar = styled(Bar)`
  background: #fee2e2;
  border-bottom-color: #ef4444;
`;

interface PersistenceBannerProps {
  loading: boolean;
  persistenceAvailable: boolean;
  usingLocalStorageFallback: boolean;
}

export default function PersistenceBanner({
  loading,
  persistenceAvailable,
  usingLocalStorageFallback,
}: PersistenceBannerProps) {
  if (loading) return null;

  if (usingLocalStorageFallback) {
    return (
      <Bar role="alert">
        <span>
          IndexedDB isn&apos;t available on this device. Your workspace is being saved to localStorage
          instead, which has smaller storage limits. For best performance and higher storage capacity,
          try a browser session that allows IndexedDB.
        </span>
      </Bar>
    );
  }

  if (!persistenceAvailable) {
    return (
      <ErrorBar role="alert">
        <span>
          Neither localStorage nor IndexedDB could be used. Your data will not be persisted across
          reloads or when this tab is closed. For best performance and storage, use a browser that
          supports IndexedDB.
        </span>
      </ErrorBar>
    );
  }

  return null;
}

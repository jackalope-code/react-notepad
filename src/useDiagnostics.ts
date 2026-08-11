import { useSyncExternalStore } from 'react';
import { getDiagnostics, subscribe } from './diagnostics';

export function useDiagnostics() {
  return useSyncExternalStore(subscribe, getDiagnostics, getDiagnostics);
}

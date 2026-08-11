// ---------------------------------------------------------------------------
// Diagnostics module
// ---------------------------------------------------------------------------
//
// Captures runtime errors from marked.lexer() and feature-detection results
// so they can be surfaced to the user via a notification bar and diagnostics
// page, rather than only visible in the browser console (which is hard to
// access on a mobile PWA).

export interface DiagnosticsInfo {
  features: {
    arrayAt: boolean;
    regExpLookbehind: boolean;
    unicodePropEscapes: boolean;
  };
  errors: { timestamp: number; message: string }[];
}

let info: DiagnosticsInfo = {
  features: detectFeatures(),
  errors: [],
};

const listeners = new Set<() => void>();

function detectFeatures(): DiagnosticsInfo['features'] {
  let regExpLookbehind = false;
  try {
    new RegExp('(?<=a)b');
    regExpLookbehind = true;
  } catch {}

  let unicodePropEscapes = false;
  try {
    new RegExp('\\p{P}', 'u');
    unicodePropEscapes = true;
  } catch {}

  return {
    arrayAt: typeof Array.prototype.at === 'function',
    regExpLookbehind,
    unicodePropEscapes,
  };
}

export function getDiagnostics(): DiagnosticsInfo {
  return info;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function logError(message: string) {
  info = {
    ...info,
    errors: [...info.errors, { timestamp: Date.now(), message }],
  };
  notify();
}

export function clearErrors() {
  info = { ...info, errors: [] };
  notify();
}

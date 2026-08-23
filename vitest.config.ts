import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

// Vitest cannot load the VitePWA `virtual:pwa-register` module because the
// PWA plugin is not part of the test build. This tiny plugin intercepts it
// and provides a no-op registration function so the component can render in
// jsdom without trying to register a real service worker.
const pwaStubPlugin = {
  name: 'pwa-stub',
  enforce: 'pre' as const,
  resolveId(source: string) {
    if (source === 'virtual:pwa-register') {
      return '\0virtual:pwa-register';
    }
  },
  load(id: string) {
    if (id === '\0virtual:pwa-register') {
      // Exposes the options passed to registerSW (and a fake registration
      // object) on globalThis so tests can drive onNeedRefresh/onOfflineReady
      // and assert on registration.update() calls, without a real SW.
      return `export function registerSW(opts) {
        globalThis.__pwaRegisterSWOpts = opts;
        if (opts && opts.onRegisteredSW) {
          opts.onRegisteredSW('sw.js', globalThis.__mockRegistration);
        }
        return () => Promise.resolve();
      }`;
    }
  },
};

export default defineConfig({
  plugins: [react(), pwaStubPlugin],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/Notepad.tsx', 'src/MarkdownOverlayNotepad.tsx', 'src/App.tsx', 'src/MainView.tsx', 'src/DocumentSettings.tsx', 'src/useWorkspace.ts'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});

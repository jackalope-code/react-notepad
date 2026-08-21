import { HashRouter, Routes, Route } from 'react-router-dom';
import MainView from './MainView';
import DocumentSettings from './DocumentSettings';
import DiagnosticsPage from './DiagnosticsPage';
import DiagnosticsBanner from './DiagnosticsBanner';
import PersistenceBanner from './PersistenceBanner';
import PwaReloadPrompt from './PwaReloadPrompt';
import { useWorkspace } from './useWorkspace';

// HashRouter (rather than BrowserRouter) is used because this app is
// deployed as a static site to GitHub Pages under a subpath (base:
// '/react-notepad/', see vite.config.ts) with no server-side SPA fallback
// (no custom 404.html rewrite configured) — a BrowserRouter path like
// /react-notepad/settings/:id would 404 on a hard refresh or direct link,
// whereas a HashRouter path never leaves the client, so it always resolves.
//
// useWorkspace() is instantiated once here and passed down to both routes
// rather than each route calling it independently: since all writes go
// through a *debounced* persist (see useWorkspace.ts), two separate hook
// instances race on navigation — e.g. Settings could `navigate('/')` before
// its debounced write flushes to IndexedDB, and MainView's independent
// instance would then reload the stale pre-toggle state from storage. A
// single shared instance has no such race, and also avoids an unnecessary
// full workspace reload (loading flash) every time the user opens Settings.
function App() {
  const workspace = useWorkspace();

  return (
    <HashRouter>
      <PersistenceBanner
        loading={workspace.loading}
        persistenceAvailable={workspace.persistenceAvailable}
        usingLocalStorageFallback={workspace.usingLocalStorageFallback}
      />
      <DiagnosticsBanner />
      <Routes>
        <Route path="/" element={<MainView workspace={workspace} />} />
        <Route path="/settings/:documentId" element={<DocumentSettings workspace={workspace} />} />
        <Route path="/diagnostics" element={<DiagnosticsPage />} />
      </Routes>
      <PwaReloadPrompt />
    </HashRouter>
  );
}

export default App

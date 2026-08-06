import styled from 'styled-components';
import { useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import NavBar from './NavBar';
import type { useWorkspace } from './useWorkspace';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';

const SettingsContainer = styled.div`
  padding: 16px;
  max-width: 480px;
`;

const SettingsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 24px;
`;

interface DocumentSettingsProps {
  workspace: ReturnType<typeof useWorkspace>;
}

function DocumentSettings({ workspace }: DocumentSettingsProps) {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { loading, documents, setMarkdownEnabled } = workspace;

  const doc = documents.find((d) => d.id === documentId);

  // Pending (unsaved) state for the toggle, initialized once the document
  // is found; Save persists it, Back discards it. Since `document` may be
  // undefined until the workspace finishes loading, this is initialized
  // lazily from the document once available rather than eagerly.
  const [pendingMarkdownEnabled, setPendingMarkdownEnabled] = useState<boolean | null>(null);

  if (loading) {
    return (
      <>
        <NavBar>
          <span>react-notepad</span>
          <a href="https://github.com/jackalope-code/react-notepad"><FontAwesomeIcon icon={faGithub} className="icon"/></a>
        </NavBar>
        <div className="toolbar">Loading…</div>
      </>
    );
  }

  // Orphaned id (e.g. closed in another tab/session, or a stale/garbage
  // link) — redirect back to the main view rather than crashing on a
  // missing document.
  if (!doc) {
    return <Navigate to="/" replace />;
  }

  const markdownEnabled = pendingMarkdownEnabled ?? doc.markdownEnabled;

  function handleSave() {
    setMarkdownEnabled(doc!.id, markdownEnabled);
    navigate('/');
  }

  function handleBack() {
    navigate('/');
  }

  return (
    <>
      <NavBar>
        <span>react-notepad</span>
        <a href="https://github.com/jackalope-code/react-notepad"><FontAwesomeIcon icon={faGithub} className="icon"/></a>
      </NavBar>
      <SettingsContainer>
        <h2>Settings for "{doc.title || 'Untitled'}"</h2>
        <SettingsRow>
          <input
            id="input-settings-markdown-enabled"
            type="checkbox"
            checked={markdownEnabled}
            onChange={(e) => setPendingMarkdownEnabled(e.currentTarget.checked)}
          />
          <label htmlFor="input-settings-markdown-enabled">Live Markdown Rendering</label>
        </SettingsRow>
        <ButtonRow>
          <button onClick={handleSave} aria-label="Save">Save</button>
          <button onClick={handleBack} aria-label="Back">Back</button>
        </ButtonRow>
      </SettingsContainer>
    </>
  );
}

export default DocumentSettings;

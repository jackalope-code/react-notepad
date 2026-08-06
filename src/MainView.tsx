import styled from 'styled-components';
import Footer from './Footer'
import NavBar from './NavBar'
import Notepad from './Notepad'
import MarkdownNotepad from './MarkdownNotepad'
import TabBar from './TabBar';
import NewDocumentDialog from './NewDocumentDialog';
import ExportDialog from './ExportDialog';
import type { useWorkspace } from './useWorkspace';
import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { faRotateLeft, faRotateRight, faFileExport } from '@fortawesome/free-solid-svg-icons';

const TitleInput = styled.input`
  border: none;
  display: inline;
  font-family: inherit;
  font-size: inherit;
  padding: none;
  width: auto;
  font-size: 1.5rem;
  font-weight: 600;
`;

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface MainViewProps {
  workspace: ReturnType<typeof useWorkspace>;
}

function MainView({ workspace }: MainViewProps) {
    const {
      loading,
      documents,
      activeDocumentId,
      setActiveDocumentId,
      addDocument,
      closeDocument,
      setLines,
      setTitle,
      setOptions,
      getHistory,
      undo,
      redo,
    } = workspace;

    const navigate = useNavigate();
    const [newDocDialogOpen, setNewDocDialogOpen] = useState(false);
    const [exportDialogOpen, setExportDialogOpen] = useState(false);

    const activeDocument = documents.find((doc) => doc.id === activeDocumentId);

    if (loading || !activeDocument) {
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

    const { stateHistory, stateIndex } = getHistory(activeDocument.id);
    const canUndo = stateIndex >= 0;
    const canRedo = stateIndex < stateHistory.length - 1;

    function handleOptionChanged(optionTarget: string, e: ChangeEvent<HTMLInputElement>) {
      switch(optionTarget) {
        case 'options.text.notepadWrap':
          setOptions(activeDocument!.id, {
            ...activeDocument!.options,
            text: { ...activeDocument!.options.text, notepadWrap: e.currentTarget.checked },
          });
          break;
        case 'options.text.showLineNumbers':
          setOptions(activeDocument!.id, {
            ...activeDocument!.options,
            text: { ...activeDocument!.options.text, showLineNumbers: e.currentTarget.checked },
          });
          break;
      }
    }

    function handleUndoClicked() {
      undo(activeDocument!.id);
    }

    function handleRedoClicked() {
      redo(activeDocument!.id);
    }

    function handleExport(extension: string) {
      downloadTextFile(`${activeDocument!.title}.${extension}`, activeDocument!.lines.join('\n'));
      setExportDialogOpen(false);
    }

    function handleSettingsClick(id: string) {
      navigate(`/settings/${id}`);
    }

  return (
    <>
      <NavBar>
          <span>react-notepad</span>
          <a href="https://github.com/jackalope-code/react-notepad"><FontAwesomeIcon icon={faGithub} className="icon"/></a>
      </NavBar>
      <TabBar
        documents={documents}
        activeDocumentId={activeDocument.id}
        onSelect={setActiveDocumentId}
        onClose={closeDocument}
        onAddClick={() => setNewDocDialogOpen(true)}
        onSettingsClick={handleSettingsClick}
      />
      <div className="toolbar">
        <button onClick={handleUndoClicked} disabled={!canUndo} aria-label="Undo">
          <FontAwesomeIcon icon={faRotateLeft} /> Undo
        </button>
        <button onClick={handleRedoClicked} disabled={!canRedo} aria-label="Redo">
          <FontAwesomeIcon icon={faRotateRight} /> Redo
        </button>
        <input id="input-toolbar-wrap-text" type="checkbox" name="input-toolbar-wrap-text" checked={activeDocument.options.text.notepadWrap} onChange={(e) => handleOptionChanged("options.text.notepadWrap", e)}/>
        <label htmlFor="input-toolbar-wrap-text">Wrap text</label>
        {!activeDocument.markdownEnabled && (
          <>
            <input id="input-toolbar-line-numbers" type="checkbox" name="input-toolbar-line-numbers" checked={!!activeDocument.options.text.showLineNumbers} onChange={(e) => handleOptionChanged("options.text.showLineNumbers", e)}/>
            <label htmlFor="input-toolbar-line-numbers">Line numbers</label>
          </>
        )}
        <button onClick={() => setExportDialogOpen(true)} aria-label="Save as file">
          <FontAwesomeIcon icon={faFileExport} /> Save as file
        </button>
      </div>
      <TitleInput className="title" type="text" onChange={(e) => setTitle(activeDocument!.id, e.currentTarget.value)} value={activeDocument.title} />
      {activeDocument.markdownEnabled ? (
        <MarkdownNotepad
          lines={activeDocument.lines}
          setLines={(lines, cursorLine) => setLines(activeDocument!.id, lines, cursorLine)}
          options={activeDocument.options}
        />
      ) : (
        <Notepad
          lines={activeDocument.lines}
          setLines={(lines, cursorLine) => setLines(activeDocument!.id, lines, cursorLine)}
          options={activeDocument.options}
        />
      )}
      <Footer />
      <NewDocumentDialog
        open={newDocDialogOpen}
        onClose={() => setNewDocDialogOpen(false)}
        onCreate={(title) => {
          addDocument(title);
          setNewDocDialogOpen(false);
        }}
      />
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExport}
      />
    </>
  )
}

export default MainView

import styled from 'styled-components';
import Footer from './Footer'
import NavBar from './NavBar'
import Notepad, { useNotepad } from './Notepad'
import { type ChangeEvent } from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons';

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

function App() {
    const { lines, setLines, title, setTitle, options, setOptions, undo, redo } = useNotepad();

    function handleOptionChanged(optionTarget: string, e: ChangeEvent<HTMLInputElement>) {
      switch(optionTarget) {
        case 'options.text.notepadWrap':
          setOptions({ ...options, text: { ...options.text, notepadWrap: e.currentTarget.checked } });
          break;
      }
    }

    function handleUndoClicked() {
      undo();
    }

    function handleRedoClicked() {
      redo();
    }

  return (
    <>
      <NavBar>
          <span>react-notepad</span>
          <a href="https://github.com/jackalope-code/react-notepad"><FontAwesomeIcon icon={faGithub} className="icon"/></a>
      </NavBar>
      <div className="toolbar">
        <button onClick={handleUndoClicked}><FontAwesomeIcon icon={faRotateLeft} aria-details='Undo'/></button>
        <button onClick={handleRedoClicked}><FontAwesomeIcon icon={faRotateRight} aria-details='Redo' /></button>
        <input type="checkbox" name="input-toolbar-wrap-text" checked={options.text.notepadWrap} onChange={(e) => handleOptionChanged("options.text.notepadWrap", e)}/>
        <label htmlFor="input-toolbar-wrap-text">Wrap text</label>
      </div>
      <TitleInput className="title" type="text" onChange={(e) => setTitle(e.currentTarget.value)} value={title} />
      <Notepad lines={lines} setLines={setLines} options={options} />
      <Footer />
    </>
  )
}

export default App

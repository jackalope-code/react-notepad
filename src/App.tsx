import styled from 'styled-components';
import Footer from './Footer'
import NavBar from './NavBar'
import Notepad, { useNotepad, type NotepadOptions } from './Notepad'
import { useEffect, useState, type ChangeEvent } from 'react';
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

const tempOptions = {text: {notepadWrap: true}};

function App() {
    const [text, setText, title, setTitle, options, _, stateHistory, stateIndex, setStateIndex] = useNotepad();
    const [optionsObj, setOptionsObj] = useState<NotepadOptions>(tempOptions)
    useEffect(() => {
      try {
        if(options) {
          setOptionsObj(JSON.parse(options))
        } else {
          setOptionsObj(tempOptions)
        }
      } catch(e: any) {
        setOptionsObj(tempOptions)
      }
    }, [options])

    function handleOptionChanged(optionTarget: string, e: ChangeEvent<HTMLInputElement>) {
      switch(optionTarget) {
        case 'options.text.notepadWrap':
          setOptionsObj({...optionsObj, text: {...optionsObj?.text, notepadWrap: e.currentTarget.checked}})
      }
    }

    // TODO: TYPES
    function handleUndoClicked(e: any) {
      setStateIndex(Math.max(0, stateIndex-1))
    }

    function handleRedoClicked(e: any) {
      setStateIndex(Math.min(stateHistory.length, stateIndex + 1))
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
        <input type="checkbox" name="input-toolbar-wrap-text" checked={optionsObj?.text.notepadWrap} onChange={(e) => handleOptionChanged("options.text.notepadWrap", e)}/>
        <label htmlFor="input-toolbar-wrap-text">Wrap text</label>
      </div>
      <TitleInput className="title" type="text" onChange={(e) => setTitle(e.currentTarget.value)} value={title} />
        {/* TODO Add a check on JSON parsing */}
      <Notepad text={text} setText={setText} options={optionsObj}></Notepad>
      {/* <Notepad text={text} setText={setText} options={{text: {notepadWrap: true}}}></Notepad> */}
      <Footer></Footer>
    </>
  )
}

export default App

import styled from 'styled-components';
import Footer from './Footer'
import NavBar from './NavBar'
import Notepad, { useNotepad, type NotepadOptions } from './Notepad'
import { useEffect, useState } from 'react';


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
    const [text, setText, title, setTitle, options, setOptions] = useNotepad();
    const [optionsObj, setOptionsObj] = useState<NotepadOptions>()
    useEffect(() => {
      if(options) {
        setOptionsObj(JSON.parse(options))
      }
    }, [options])

    function handleOptionChanged(optionTarget: string, e: InputEvent) {
      switch(optionTarget) {
        case 'options.text.notepadWrap':
          setOptionsObj({...optionsObj, text: {...optionsObj?.text, notepadWrap: !optionsObj?.text.notepadWrap}})
      }
    }

  return (
    <>
      <NavBar>
          <span>react-notepad</span>
      </NavBar>
      <div className="toolbar">
        <label htmlFor="input-wrap-text">Wrap text</label>
        <input type="checkbox" name="input-wrap-text" checked={optionsObj?.text.notepadWrap} onChange={(e) => handleOptionChanged("options.text.notepadWrap", e)}/>
      </div>
      <TitleInput className="title" type="text" onChange={(e) => setTitle(e.currentTarget.value)} value={title} />
        {/* TODO Add a check on JSON parsing */}
      {/* <Notepad text={text} setText={setText} options={JSON.parse(options)}></Notepad> */}
      <Notepad text={text} setText={setText} options={{text: {notepadWrap: true}}}></Notepad>
      <Footer></Footer>
    </>
  )
}

export default App

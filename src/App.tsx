import styled from 'styled-components';
import Footer from './Footer'
import NavBar from './NavBar'
import Notepad, { useNotepad } from './Notepad'


const TitleInput = styled.input`
  border: none;
  display: inline;
  font-family: inherit;
  font-size: inherit;
  padding: none;
  width: auto;
  font-size: 1.3rem;
  font-weight: 600;
`;

function App() {
    const [text, setText, title, setTitle] = useNotepad();

  return (
    <>
      <NavBar>
          <span>react-notepad</span>
      </NavBar>
      <TitleInput type="text" onChange={(e) => setTitle(e.currentTarget.value)} value={title} />
      <Notepad text={text} setText={setText}></Notepad>
      <Footer></Footer>
    </>
  )
}

export default App

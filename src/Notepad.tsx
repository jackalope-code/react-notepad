import styled from 'styled-components';
import useLocalStorage from './utils/useLocalStorage';
//import {LocalStorage} from './utils/persistence'

type TextAreaProps = NotepadOptions["text"];

const StyledTextArea = styled.textarea<TextAreaProps>`
    width: 100%;
    height: 100dvh;
    overflow-y: scroll;
    overflow-x: ${(props) => props.notepadWrap ? "none;" : "scroll;"};
    scroll-x: ${(props) => props.notepadWrap ? "none;" : "scroll;"};
    highlight-on-focus: true;
    highlight-color: lightgray;
    resize: none;
`;

//const NotepadContext = createContext({lines: [''], getText, setText})

export const useNotepad = () => {
    //const notepadContext = useContext(NotepadContext)
    // const [lines, setLines] = useState<string[]> (['']);

    const [title, setTitle] = useLocalStorage('react-notepad-title', 'Title');
    const [text, setText] = useLocalStorage('react-notepad-text', '');
    const [options, setOptions] = useLocalStorage('react-notepad-options', JSON.stringify({text: {notepadWrap: true}}))
    // useEffect(() => {
    //     setLines(text.split("\n"));
    // }, [text])


    // function getText(): string {
    //     return lines.join('\n');
    // }

    // function setText(value: string) {
    //         setLines(value.split("\n"));
    // }

    //return [text, getText, setText, setLines] as [string, typeof getText, typeof setText, typeof setLines];
    return [text, setText, title, setTitle, options, setOptions] as [string, typeof setText, string, typeof setTitle, typeof options, typeof setOptions];
}

export interface NotepadOptions {
    text: {
        notepadWrap: boolean
    }
}

interface NotepadProps {
    text: string;
    setText: React.Dispatch<string>;
    options: NotepadOptions;
}

const Notepad = ({text, setText, options}: NotepadProps) => {

    function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
        const text = event.target.value;
        //const updatedLines = text.split('\n');
        setText(text);
    }

    return (
        <>
            {/* For debugging */}
            {/* <LocalStorage fieldNames={['react-notepad']} /> */}
            <StyledTextArea wrap={options.text.notepadWrap ? "on" : "off"} notepadWrap={options.text.notepadWrap} value={text} onChange={handleTextChange}></StyledTextArea>
        </>
    );
}

export default Notepad;
import styled from 'styled-components';
import useLocalStorage from './utils/useLocalStorage';
import { debounce } from './utils/functions';
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

// enum DiffOperation {
//     INSERT, MODIFY, DELETE
// }
// interface LineDifference {
//     lineNum: number;
//     characterPosition: number;
//     operation: DiffOperation;
//     text?: string

// }

// //const NotepadContext = createContext({lines: [''], getText, setText})

// function diff(originalText: string, modifiedText: string) {
//     const maxLen = Math.max(originalText.length, modifiedText.length);
//     for(let i = 0; i < maxLen; i++) {
        
//     }
// }

// function applyDiff(originalText, diff: Difference) {

// }

export const useNotepad = () => {
    //const notepadContext = useContext(NotepadContext)
    // const [lines, setLines] = useState<string[]> (['']);

    const [title, setTitle] = useLocalStorage('react-notepad-title', 'Title');
    const [text, setText] = useLocalStorage('react-notepad-text', '');
    const [options, setOptions] = useLocalStorage('react-notepad-options', JSON.stringify({text: {notepadWrap: true}}))
    const [stateHistory, setStateHistory] = useLocalStorage('react-notepad-undo-redo-history', JSON.stringify([]));
    const [stateIndex, setStateIndex] = useLocalStorage('react-notepad-state-index', '0');

    // useEffect(() => {
    //     setLines(text.split("\n"));
    // }, [text])

    function historyAwareSetText(text: string) {
        setText(text);
        const stateHistoryArray = JSON.parse(stateHistory)
        setStateHistory(JSON.stringify({...stateHistoryArray, text}));
    }

    function setStateIndexNumeric(index: number) {
        setStateIndex(index.toString())
    }

    function getText() {
        return stateHistory[Number.parseInt(stateIndex)];
    }

    // function getText(): string {
    //     return lines.join('\n');
    // }

    // function setText(value: string) {
    //         setLines(value.split("\n"));
    // }

    //return [text, getText, setText, setLines] as [string, typeof getText, typeof setText, typeof setLines];
    return [getText, historyAwareSetText, title, setTitle, options, setOptions, stateHistory, stateIndex, setStateIndexNumeric] as [typeof getText, typeof historyAwareSetText, string, typeof setTitle, typeof options, typeof setOptions, typeof stateHistory, typeof stateIndex, typeof setStateIndexNumeric];
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
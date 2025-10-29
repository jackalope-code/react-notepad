import { createContext, useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import useLocalStorage from './utils/useLocalStorage';
import {LocalStorage} from './utils/persistence'

const StyledTextArea = styled.textarea`
    width: 100%;
    height: 100dvh;
    overflow-y: scroll;
    overflow-x: scroll;
    scroll-x: scroll;
    highlight-on-focus: true;
    highlight-color: lightgray;
`;

//const NotepadContext = createContext({lines: [''], getText, setText})

const useNotepad = () => {
    //const notepadContext = useContext(NotepadContext)
    const [lines, setLines] = useState<string[]> (['']);

    const [text, setText] = useLocalStorage('react-notepad', '');

    useEffect(() => {
        setLines(text.split("\n"));
    }, [text])


    function getText(): string {
        return lines.join('\n');
    }

    // function setText(value: string) {
    //         setLines(value.split("\n"));
    // }

    return [text, getText, setText, setLines] as [string, typeof getText, typeof setText, typeof setLines];
}

const Notepad = () => {

    const [text, getText, setText, setLines] = useNotepad();

    function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
        const text = event.target.value;
        //const updatedLines = text.split('\n');
        setText(text);
    }

    return (
        <>
            {/* For debugging */}
            {/* <LocalStorage fieldNames={['react-notepad']} /> */}
            <StyledTextArea wrap="off" value={text} onChange={handleTextChange}></StyledTextArea>
        </>
    );
}

export default Notepad;
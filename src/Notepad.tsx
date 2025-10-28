import { useState } from 'react';
import styled from 'styled-components';

const StyledTextArea = styled.textarea`
    width: 100%;
    height: 100dvh;
    overflow-y: scroll;
    overflow-x: scroll;
    scroll-x: scroll;
    highlight-on-focus: true;
    highlight-color: lightgray;
`;

const Notepad = () => {
    const [lines, setLines] = useState<string[]> (['']);

    function getText(): string {
        return lines.join('\n');
    }

    function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
        const text = event.target.value;
        const updatedLines = text.split('\n');
        setLines(updatedLines);
    }

    return (
        <>
            <StyledTextArea wrap="off" value={getText()} onChange={handleTextChange}></StyledTextArea>
        </>
    );
}

export default Notepad;
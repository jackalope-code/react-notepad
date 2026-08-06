import styled from 'styled-components';
import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';
import type { CursorPosition, NotepadOptions } from './Notepad';

function getMarkdownStorage(editor: Editor): MarkdownStorage {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown;
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const EditorContainer = styled.div<{ $notepadWrap: boolean }>`
  width: 100%;
  min-height: 100dvh;
  box-sizing: border-box;
  padding: 8px 12px;
  overflow-x: ${(props) => (props.$notepadWrap ? 'hidden' : 'auto')};

  .tiptap {
    outline: none;
    min-height: calc(100dvh - 16px);
    white-space: ${(props) => (props.$notepadWrap ? 'pre-wrap' : 'pre')};
  }
`;

const StatusBar = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  padding: 2px 8px;
  font-size: 0.8rem;
  background-color: #f0f0f0;
  border-top: 1px solid lightgray;
`;

// ---------------------------------------------------------------------------
// TipTap cursor position adapter
// ---------------------------------------------------------------------------

/**
 * TipTap has no raw `textarea.selectionStart` to work with, and the rendered
 * document tree strips markdown syntax markers (e.g. `**`), so this is a
 * best-effort approximation rather than an exact index into the underlying
 * markdown source: it treats block boundaries in the *rendered* document as
 * line breaks and the offset within the current block as the column.
 */
export function getTiptapCursorPosition(editor: Editor): CursorPosition {
  const { from } = editor.state.selection;
  const textBefore = editor.state.doc.textBetween(0, from, '\n', '\n');
  const parts = textBefore.split('\n');
  return { line: parts.length - 1, column: parts[parts.length - 1].length };
}

// ---------------------------------------------------------------------------
// MarkdownNotepad component
// ---------------------------------------------------------------------------

interface MarkdownNotepadProps {
  lines: string[];
  setLines: (lines: string[], cursorLine: number) => void;
  options: NotepadOptions;
}

const MarkdownNotepad = ({ lines, setLines, options }: MarkdownNotepadProps) => {
  const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null);
  // Tracks the markdown string this component last emitted via setLines, so
  // the sync effect below can tell "lines changed because we just typed"
  // (skip resetting the editor, which would clobber the in-flight keystroke
  // and cursor position) apart from "lines changed externally" (undo/redo,
  // tab switch, initial load — reset the editor content to match).
  const lastEmittedRef = useRef<string>(lines.join('\n'));

  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: lastEmittedRef.current,
    onUpdate: ({ editor }) => {
      const markdown = getMarkdownStorage(editor).getMarkdown();
      lastEmittedRef.current = markdown;
      const newLines = markdown.split('\n');
      const position = getTiptapCursorPosition(editor);
      setCursorPosition(position);
      setLines(newLines, position.line);
    },
    onSelectionUpdate: ({ editor }) => {
      setCursorPosition(getTiptapCursorPosition(editor));
    },
    onFocus: ({ editor }) => {
      setCursorPosition(getTiptapCursorPosition(editor));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = lines.join('\n');
    if (incoming !== lastEmittedRef.current) {
      lastEmittedRef.current = incoming;
      editor.commands.setContent(incoming);
    }
  }, [lines, editor]);

  return (
    <>
      <EditorContainer $notepadWrap={options.text.notepadWrap}>
        <EditorContent editor={editor} />
      </EditorContainer>
      <StatusBar>
        {cursorPosition !== null
          ? `Line ${cursorPosition.line + 1}, Col ${cursorPosition.column + 1}`
          : 'Line —, Col —'}
      </StatusBar>
    </>
  );
};

export default MarkdownNotepad;

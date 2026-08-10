# NotepadJS

Bootstrapped with vite. This app is available at https://jackalope-code.github.io/react-notepad/

## Technologies used
* React + TypeScript + Vite
* localStorage API with a custom useLocalStorage hook to persist data on the user's machine
* Uses the VitePWA plugin to allow users to install the app as a PWA
* Trying marked for markdown rendering

## To-Do
* Better navigation around edges
* Store text as an array of lines
* Undo/redo history
* More Notepad features
  * Editor
    * Line numbers
  * Text
    * Font size
    * Font style
    * Permanent highlighting (and the ability to toggle off all styles for e.g. pasting code)
    * Markdown formatting
    * Find/Replace with regex
* Better Notepad abstractions (Use a context with Notepad.js?)
  * Allow for notes to be exposed as an API with user authentication
* Cloud storage
  * User accounts
* Use encryption?

## Known perf optimizations to revisit
* `MarkdownNotepad` (TipTap/ProseMirror) adds a >500kB chunk to the production build. Since it's only needed for documents with `markdownEnabled: true`, it's a good candidate for `React.lazy`/dynamic `import()` code-splitting in `App.tsx` so the plain-textarea `Notepad` path doesn't pay for it upfront.

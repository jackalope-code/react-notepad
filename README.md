# NotepadJS

Bootstrapped with vite. This app is available at https://jackalope-code.github.io/react-notepad/

## V3 NOTES (v3 has not been merged to main yet... still a work in progress): ##
- Technical details:
  - Uses IndexedDB instead of localStorage
  - Optionally replaces a basic <textarea> element with a virtualized editor. The default is the virtualized editor for better performance with large text documents.
  - Optionally replaces array of strings with a Rope structure. Defaults to the Rope structure for better performance with large text documents.
  - Adds lots of tests
  - Performance with large to very large (1GB+) text documents will need to be tested
- Features:
  - Support for multiple documents
  - Markdown support with in-place markdown rendering
  - File import and export
  - Better navigation on mobile with D-pad
  - Line numbers

## Core Technologies used
* React + TypeScript + Vite
* localStorage API with a custom useLocalStorage hook to persist data on the user's machine
  * IndexedDB is used instead of localStorage on v3+ of this app
* Uses the VitePWA plugin to allow users to install the app as a PWA
* Trying TipTap for Markdown support


## To-Do
* Better navigation around edges
* ~~Store text as an array of lines~~
* ~~Undo/redo history~~
* ~~Line numbers~~
* Richer documents
  * Mixed fonts
    * Font style
    * Font size
  * Permanent highlighting (and the ability to toggle off all styles for e.g. pasting code)
  * Images
  * Drawing support
  * LaTeX
  * ~~Markdown formatting~~
  * Charts
* Find/Replace with regex
* Better Notepad abstractions (Use a context with Notepad.js?)
  * Allow for notes to be exposed as an API with user authentication
* Cloud storage
  * User accounts

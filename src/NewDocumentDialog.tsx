import { useState, type KeyboardEvent } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from '@mui/material';

interface NewDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
}

const DEFAULT_TITLE = 'Untitled';

function NewDocumentDialog({ open, onClose, onCreate }: NewDocumentDialogProps) {
  const [title, setTitle] = useState(DEFAULT_TITLE);

  function handleCreate() {
    onCreate(title.trim() || DEFAULT_TITLE);
    setTitle(DEFAULT_TITLE);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleCreate();
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>New Document</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} variant="contained">
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default NewDocumentDialog;

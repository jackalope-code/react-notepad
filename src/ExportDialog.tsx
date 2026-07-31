import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  TextField,
  Button,
  FormControl,
  InputLabel,
  type SelectChangeEvent,
} from '@mui/material';

const PRESET_EXTENSIONS = ['txt', 'md', 'yaml', 'json', 'py', 'java', 'c', 'cpp'];
const OTHER_VALUE = '__other__';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (extension: string) => void;
}

/**
 * A valid extension is non-empty and does not contain path separators or
 * dots (an "extension" here is just the suffix after the final dot, not a
 * full filename).
 */
export function isValidExtension(ext: string): boolean {
  return ext.length > 0 && !ext.includes('/') && !ext.includes('\\') && !ext.includes('.');
}

function ExportDialog({ open, onClose, onExport }: ExportDialogProps) {
  const [selected, setSelected] = useState<string>(PRESET_EXTENSIONS[0]);
  const [customExtension, setCustomExtension] = useState('');

  const isOther = selected === OTHER_VALUE;
  const effectiveExtension = isOther ? customExtension.trim() : selected;
  const isValid = isValidExtension(effectiveExtension);

  function handleSelectChange(e: SelectChangeEvent) {
    setSelected(e.target.value);
  }

  function handleExport() {
    if (!isValid) return;
    onExport(effectiveExtension);
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Export Document</DialogTitle>
      <DialogContent>
        <FormControl fullWidth margin="dense">
          <InputLabel id="export-extension-label">Extension</InputLabel>
          <Select
            labelId="export-extension-label"
            label="Extension"
            value={selected}
            onChange={handleSelectChange}
          >
            {PRESET_EXTENSIONS.map((ext) => (
              <MenuItem key={ext} value={ext}>
                .{ext}
              </MenuItem>
            ))}
            <MenuItem value={OTHER_VALUE}>Other…</MenuItem>
          </Select>
        </FormControl>
        {isOther && (
          <TextField
            fullWidth
            margin="dense"
            label="Custom extension"
            value={customExtension}
            onChange={(e) => setCustomExtension(e.target.value)}
            error={!isValid}
            helperText={!isValid ? 'Enter a valid extension (no dots or slashes)' : ' '}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleExport} variant="contained" disabled={!isValid}>
          Export
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ExportDialog;

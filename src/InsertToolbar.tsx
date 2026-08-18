import { useState } from 'react';
import styled from 'styled-components';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  type SelectChangeEvent,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTable, faChartLine, faPlus } from '@fortawesome/free-solid-svg-icons';

// ---------------------------------------------------------------------------
// InsertToolbar
// ---------------------------------------------------------------------------
//
// A floating, expandable "insert" button for the Markdown overlay editor.
// Tapping it reveals "Insert Table" / "Insert Chart" options; picking one
// opens a small dialog to choose a size (table) or chart type, then hands
// the generated starter lines back to the parent via `onPrepareInsert`.
// The parent (MarkdownOverlayNotepad) enters "placement mode": the next
// click/tap in the document inserts those lines at that position. This
// keeps all document-line splicing logic in one place (the parent, which
// already owns the click-to-line mapping) rather than duplicating it here.

const ToolbarContainer = styled.div`
  position: fixed;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  z-index: 20;
`;

const ToggleButton = styled.button`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background-color: #2563eb;
  color: white;
  font-size: 1.1rem;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
`;

const ExpandedOption = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #cbd5e1;
  background: white;
  border-radius: 20px;
  padding: 6px 12px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
`;

const PlacementBanner = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  padding: 8px 12px;
  background-color: #1d4ed8;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  z-index: 30;
`;

/** Generates a starter GFM pipe-table with placeholder header/cell text. */
function buildTableLines(rows: number, cols: number): string[] {
  const header = `| ${Array.from({ length: cols }, (_, c) => `Header ${c + 1}`).join(' | ')} |`;
  const divider = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
  const body = Array.from(
    { length: rows },
    (_, r) => `| ${Array.from({ length: cols }, (_, c) => `Cell ${r + 1}.${c + 1}`).join(' | ')} |`,
  );
  return [header, divider, ...body];
}

const CHART_TEMPLATES: Record<string, string> = {
  Flowchart: 'graph TD;\n  A[Start] --> B[Step 1];\n  B --> C[End];',
  Sequence: 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: Message',
  Pie: 'pie title Distribution\n  "Slice 1" : 40\n  "Slice 2" : 60',
  Class: 'classDiagram\n  ClassA <|-- ClassB',
};

/** Generates a starter ```mermaid fence for the chosen chart type. */
function buildChartLines(chartType: string): string[] {
  const source = CHART_TEMPLATES[chartType] ?? CHART_TEMPLATES.Flowchart;
  return ['```mermaid', ...source.split('\n'), '```'];
}

interface InsertToolbarProps {
  /** True while a table/chart has been chosen and is awaiting placement. */
  active: boolean;
  onPrepareInsert: (lines: string[]) => void;
  onCancelPlacement: () => void;
}

function InsertToolbar({ active, onPrepareInsert, onCancelPlacement }: InsertToolbarProps) {
  const [expanded, setExpanded] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [chartDialogOpen, setChartDialogOpen] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [chartType, setChartType] = useState('Flowchart');

  if (active) {
    return (
      <PlacementBanner data-testid="placement-banner">
        <span>Tap or click where the table/chart should go</span>
        <Button size="small" variant="outlined" color="inherit" onClick={onCancelPlacement}>
          Cancel
        </Button>
      </PlacementBanner>
    );
  }

  return (
    <>
      <ToolbarContainer data-testid="insert-toolbar">
        {expanded && (
          <>
            <ExpandedOption
              onClick={() => {
                setTableDialogOpen(true);
                setExpanded(false);
              }}
              aria-label="Insert table"
            >
              <FontAwesomeIcon icon={faTable} /> Insert Table
            </ExpandedOption>
            <ExpandedOption
              onClick={() => {
                setChartDialogOpen(true);
                setExpanded(false);
              }}
              aria-label="Insert chart"
            >
              <FontAwesomeIcon icon={faChartLine} /> Insert Chart
            </ExpandedOption>
          </>
        )}
        <ToggleButton onClick={() => setExpanded((e) => !e)} aria-label="Insert options" aria-expanded={expanded}>
          <FontAwesomeIcon icon={faPlus} />
        </ToggleButton>
      </ToolbarContainer>

      <Dialog open={tableDialogOpen} onClose={() => setTableDialogOpen(false)}>
        <DialogTitle>Insert Table</DialogTitle>
        <DialogContent style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
          <TextField
            label="Rows"
            type="number"
            value={rows}
            onChange={(e) => setRows(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
            slotProps={{ htmlInput: { min: 1, max: 20 } }}
          />
          <TextField
            label="Columns"
            type="number"
            value={cols}
            onChange={(e) => setCols(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            slotProps={{ htmlInput: { min: 1, max: 10 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTableDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              onPrepareInsert(buildTableLines(rows, cols));
              setTableDialogOpen(false);
            }}
          >
            Next: tap placement
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={chartDialogOpen} onClose={() => setChartDialogOpen(false)}>
        <DialogTitle>Insert Chart</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel id="chart-type-label">Chart type</InputLabel>
            <Select
              labelId="chart-type-label"
              label="Chart type"
              value={chartType}
              onChange={(e: SelectChangeEvent) => setChartType(e.target.value)}
            >
              {Object.keys(CHART_TEMPLATES).map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChartDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              onPrepareInsert(buildChartLines(chartType));
              setChartDialogOpen(false);
            }}
          >
            Next: tap placement
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default InsertToolbar;

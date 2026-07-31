import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ExportDialog, { isValidExtension } from './ExportDialog';

describe('isValidExtension', () => {
  it('accepts simple alphanumeric extensions', () => {
    expect(isValidExtension('txt')).toBe(true);
    expect(isValidExtension('md')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(isValidExtension('')).toBe(false);
  });

  it('rejects extensions containing slashes', () => {
    expect(isValidExtension('a/b')).toBe(false);
    expect(isValidExtension('a\\b')).toBe(false);
  });

  it('rejects extensions containing dots', () => {
    expect(isValidExtension('tar.gz')).toBe(false);
  });
});

describe('ExportDialog', () => {
  it('renders nothing meaningful when closed', () => {
    render(<ExportDialog open={false} onClose={vi.fn()} onExport={vi.fn()} />);
    expect(screen.queryByText('Export Document')).not.toBeInTheDocument();
  });

  it('exports with the default preset extension', () => {
    const onExport = vi.fn();
    render(<ExportDialog open onClose={vi.fn()} onExport={onExport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledWith('txt');
  });

  it('shows a custom extension field when "Other…" is selected and validates input', () => {
    const onExport = vi.fn();
    render(<ExportDialog open onClose={vi.fn()} onExport={onExport} />);
    fireEvent.mouseDown(screen.getByLabelText('Extension'));
    fireEvent.click(screen.getByText('Other…'));

    const customField = screen.getByLabelText('Custom extension');
    expect(customField).toBeInTheDocument();

    // Empty custom extension keeps Export disabled.
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();

    fireEvent.change(customField, { target: { value: 'rs' } });
    expect(screen.getByRole('button', { name: 'Export' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledWith('rs');
  });

  it('keeps Export disabled for an invalid custom extension', () => {
    render(<ExportDialog open onClose={vi.fn()} onExport={vi.fn()} />);
    fireEvent.mouseDown(screen.getByLabelText('Extension'));
    fireEvent.click(screen.getByText('Other…'));

    const customField = screen.getByLabelText('Custom extension');
    fireEvent.change(customField, { target: { value: 'tar.gz' } });
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<ExportDialog open onClose={onClose} onExport={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

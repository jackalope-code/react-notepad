import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NewDocumentDialog from './NewDocumentDialog';

describe('NewDocumentDialog', () => {
  it('renders nothing meaningful when closed', () => {
    render(<NewDocumentDialog open={false} onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.queryByText('New Document')).not.toBeInTheDocument();
  });

  it('defaults the title field to "Untitled"', () => {
    render(<NewDocumentDialog open onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByLabelText('Title')).toHaveValue('Untitled');
  });

  it('calls onCreate with the trimmed title when Create is clicked', () => {
    const onCreate = vi.fn();
    render(<NewDocumentDialog open onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '  My Doc  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith('My Doc');
  });

  it('falls back to "Untitled" if the title is blank', () => {
    const onCreate = vi.fn();
    render(<NewDocumentDialog open onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith('Untitled');
  });

  it('submits on Enter key press', () => {
    const onCreate = vi.fn();
    render(<NewDocumentDialog open onClose={vi.fn()} onCreate={onCreate} />);
    const input = screen.getByLabelText('Title');
    fireEvent.change(input, { target: { value: 'Enter Doc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCreate).toHaveBeenCalledWith('Enter Doc');
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<NewDocumentDialog open onClose={onClose} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

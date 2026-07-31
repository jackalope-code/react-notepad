import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TabBar from './TabBar';
import type { StoredDocumentV3 } from './utils/notepadTypes';

function makeDoc(id: string, title: string): StoredDocumentV3 {
  return {
    id,
    title,
    lines: [''],
    options: { text: { notepadWrap: true } },
    markdownEnabled: false,
  };
}

describe('TabBar', () => {
  it('renders one tab per document with correct active state', () => {
    const docs = [makeDoc('1', 'Alpha'), makeDoc('2', 'Beta')];
    render(
      <TabBar
        documents={docs}
        activeDocumentId="2"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onAddClick={vi.fn()}
      />
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('renders "Untitled" for documents with an empty title', () => {
    const docs = [makeDoc('1', '')];
    render(
      <TabBar
        documents={docs}
        activeDocumentId="1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onAddClick={vi.fn()}
      />
    );
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('calls onSelect when a tab is clicked', () => {
    const onSelect = vi.fn();
    const docs = [makeDoc('1', 'Alpha'), makeDoc('2', 'Beta')];
    render(
      <TabBar
        documents={docs}
        activeDocumentId="1"
        onSelect={onSelect}
        onClose={vi.fn()}
        onAddClick={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Beta'));
    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('does not render a close button when there is only one document', () => {
    const docs = [makeDoc('1', 'Alpha')];
    render(
      <TabBar
        documents={docs}
        activeDocumentId="1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onAddClick={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Close/ })).not.toBeInTheDocument();
  });

  it('calls onClose without triggering onSelect when close button is clicked', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const docs = [makeDoc('1', 'Alpha'), makeDoc('2', 'Beta')];
    render(
      <TabBar
        documents={docs}
        activeDocumentId="1"
        onSelect={onSelect}
        onClose={onClose}
        onAddClick={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close Beta' }));
    expect(onClose).toHaveBeenCalledWith('2');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onAddClick when the add button is clicked', () => {
    const onAddClick = vi.fn();
    const docs = [makeDoc('1', 'Alpha')];
    render(
      <TabBar
        documents={docs}
        activeDocumentId="1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onAddClick={onAddClick}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    expect(onAddClick).toHaveBeenCalledTimes(1);
  });
});

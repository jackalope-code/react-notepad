import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NavBar from './NavBar';

describe('NavBar', () => {
  it('renders children', () => {
    render(
      <NavBar>
        <span>react-notepad</span>
      </NavBar>,
    );
    expect(screen.getByText('react-notepad')).toBeInTheDocument();
  });

  it('contains the GitHub link', () => {
    render(
      <NavBar>
        <a href="https://github.com/jackalope-code/react-notepad">GitHub</a>
      </NavBar>,
    );
    const link = screen.getByRole('link', { name: 'GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.com/jackalope-code/react-notepad');
  });
});

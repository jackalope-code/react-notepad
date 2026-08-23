import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PwaReloadPrompt from './PwaReloadPrompt';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

async function flushMicrotasks() {
  // Lets the dynamic import('virtual:pwa-register') promise chain (and its
  // .then callback, which calls registerSW/onRegisteredSW) resolve.
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

describe('PwaReloadPrompt', () => {
  let updateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    updateMock = vi.fn().mockResolvedValue(undefined);
    (globalThis as Record<string, unknown>).__mockRegistration = { update: updateMock };
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).__mockRegistration;
    delete (globalThis as Record<string, unknown>).__pwaRegisterSWOpts;
  });

  it('renders nothing by default', async () => {
    render(<PwaReloadPrompt />);
    await flushMicrotasks();
    expect(screen.queryByTestId('pwa-reload-prompt')).not.toBeInTheDocument();
  });

  it('polls registration.update() on an interval while online', async () => {
    render(<PwaReloadPrompt />);
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    });
    expect(updateMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    });
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it('does not check for updates while offline', async () => {
    setOnline(false);
    render(<PwaReloadPrompt />);
    await flushMicrotasks();

    await act(async () => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 2);
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('checks immediately when connectivity is restored', async () => {
    setOnline(false);
    render(<PwaReloadPrompt />);
    await flushMicrotasks();

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('shows a reload prompt when an update is available and reloads via updateSW on click', async () => {
    render(<PwaReloadPrompt />);
    await flushMicrotasks();

    const opts = (globalThis as Record<string, any>).__pwaRegisterSWOpts;
    act(() => {
      opts.onNeedRefresh();
    });

    expect(screen.getByTestId('pwa-reload-prompt')).toBeInTheDocument();
    expect(screen.getByText('An update is available.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  });

  it('dismisses the update banner via "Later" without reloading', async () => {
    render(<PwaReloadPrompt />);
    await flushMicrotasks();

    const opts = (globalThis as Record<string, any>).__pwaRegisterSWOpts;
    act(() => {
      opts.onNeedRefresh();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByTestId('pwa-reload-prompt')).not.toBeInTheDocument();
  });

  it('shows an offline-ready message that can be dismissed', async () => {
    render(<PwaReloadPrompt />);
    await flushMicrotasks();

    const opts = (globalThis as Record<string, any>).__pwaRegisterSWOpts;
    act(() => {
      opts.onOfflineReady();
    });

    expect(screen.getByText('App ready to work offline.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByTestId('pwa-reload-prompt')).not.toBeInTheDocument();
  });
});

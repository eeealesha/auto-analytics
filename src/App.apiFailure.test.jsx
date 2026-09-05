import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// server/app.js на любую необработанную ошибку отвечает 500 {error:'internal error'} —
// это же и есть ответ при недоступной БД.
function stub500() {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: 'internal error' }),
  })));
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() { return this.state.err ? <div data-testid="crash" /> : this.props.children; }
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('дашборд при отказе API', () => {
  it('не падает и сообщает пользователю об ошибке', async () => {
    stub500();
    render(<Boundary><App /></Boundary>);

    await waitFor(() => {
      expect(screen.getByText(/Не удалось загрузить данные/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('crash')).toBeNull();
  });

  it('не падает, если API отдал объект вместо массива с кодом 200', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ unexpected: 'shape' }),
    })));
    render(<Boundary><App /></Boundary>);

    await waitFor(() => {
      expect(screen.getByText(/Не удалось загрузить данные/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('crash')).toBeNull();
  });
});

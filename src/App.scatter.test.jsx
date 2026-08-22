import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

// ResponsiveContainer в jsdom имеет нулевой размер и не рендерит чарт.
// Подменяем его на контейнер фиксированной ширины, чтобы легенда и точки оказались в DOM.
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children, height }) =>
      React.cloneElement(children, { width: 600, height: height || 300 }),
  };
});

vi.mock('../data/cars.json', () => ({
  default: [
    { id: 1, brand: 'BMW', model: 'X5', year: 2021, mileage: 30000, price: 5000000, bodyType: 'Внедорожник', isNew: false },
    { id: 2, brand: 'Audi', model: 'Q7', year: 2020, mileage: 50000, price: 4000000, bodyType: 'Внедорожник', isNew: false },
  ],
}));

const { default: App } = await import('./App');

const legend = () => [...document.querySelectorAll('.recharts-legend-item')].map(n => n.textContent);
const points = () => document.querySelectorAll('.recharts-scatter-symbol').length;

describe('Скаттер: переключение марок через легенду', () => {
  it('скрытая марка остаётся в легенде и её можно вернуть', () => {
    render(<App />);
    expect(legend().sort()).toEqual(['Audi', 'BMW']);
    const before = points();

    const bmw = [...document.querySelectorAll('.recharts-legend-item')].find(n => n.textContent === 'BMW');
    fireEvent.click(bmw);

    expect(points()).toBeLessThan(before);
    // Ключевое: пункт легенды никуда не делся, иначе вернуть марку нечем
    expect(legend().sort()).toEqual(['Audi', 'BMW']);

    const bmwAgain = [...document.querySelectorAll('.recharts-legend-item')].find(n => n.textContent === 'BMW');
    expect(bmwAgain).toBeTruthy();
    fireEvent.click(bmwAgain);
    expect(points()).toBe(before);
  });
});

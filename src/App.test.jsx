import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { formatAnnual } from './utils/usage';

const offers = [
  { id: 1, source: 'major-expert', brand: 'Toyota', model: 'Camry', year: 2020, price: 2000000, mileage: 50000, bodyType: 'Седан', fuelType: 'Бензин', engineVolume: 2.5, horsepower: 181, url: 'https://example.com/1', image: '' },
  { id: 2, source: 'major-expert', brand: 'Toyota', model: 'Camry', year: 2021, price: 2500000, mileage: 30000, bodyType: 'Седан', fuelType: 'Бензин', engineVolume: 2.5, horsepower: 181, url: 'https://example.com/2', image: '' },
  { id: 3, source: 'major-expert', brand: 'Toyota', model: 'Camry', year: 2019, price: 1800000, mileage: 70000, bodyType: 'Седан', fuelType: 'Бензин', engineVolume: 2.5, horsepower: 181, url: 'https://example.com/3', image: '' },
  { id: 4, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2022, price: 5000000, mileage: 20000, bodyType: 'Внедорожник', fuelType: 'Дизель', engineVolume: 3.0, horsepower: 286, url: 'https://example.com/4', image: '' },
  { id: 5, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2021, price: 4500000, mileage: 40000, bodyType: 'Внедорожник', fuelType: 'Дизель', engineVolume: 3.0, horsepower: 286, url: 'https://example.com/5', image: '' },
  { id: 6, source: 'major-expert', brand: 'Lada', model: 'Granta', year: 2023, price: 800000, mileage: 5000, bodyType: 'Седан', fuelType: 'Бензин', engineVolume: 1.6, horsepower: 98, url: 'https://example.com/6', image: '' },
];

const history = { dates: [], byDate: {} };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({
    ok: true,
    status: 200,
    json: () => {
      if (url === '/api/offers') return Promise.resolve(offers);
      if (url === '/api/meta') return Promise.resolve({ sources: ['major-expert'], brands: ['Toyota', 'BMW', 'Lada'], years: [2019, 2020, 2021, 2022, 2023] });
      return Promise.resolve(history);
    },
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function getSubtitleCount(n) {
  const subtitle = await screen.findByText(new RegExp(`^${n}\\sобъявлений$`));
  return subtitle;
}

describe('App smoke tests', () => {
  it('renders header with title', async () => {
    render(<App />);
    expect(await screen.findByText('Major Expert Auto Analytics')).toBeInTheDocument();
  });

  it('displays total count of listings', async () => {
    render(<App />);
    await getSubtitleCount(6);
  });

  it('renders all filter controls', async () => {
    render(<App />);
    await screen.findByText('Все марки');
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(5);
    expect(screen.getByText('Все источники')).toBeInTheDocument();
    expect(screen.getByText('Год от')).toBeInTheDocument();
    expect(screen.getByText('Год до')).toBeInTheDocument();
    expect(screen.getByText('Все типы кузова')).toBeInTheDocument();
    expect(screen.getByText('Только выгодные предложения')).toBeInTheDocument();
  });

  it('does not render chip buttons', async () => {
    render(<App />);
    await screen.findByText('Все марки');
    expect(screen.queryByRole('button', { name: /все типы/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /седан/i })).not.toBeInTheDocument();
  });

  it('filters by brand', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все марки');
    await user.selectOptions(screen.getAllByRole('combobox')[1], 'BMW');
    await getSubtitleCount(2);
  });

  it('filters by body type via selector', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все марки');
    await user.selectOptions(screen.getAllByRole('combobox')[4], 'Внедорожник');
    await getSubtitleCount(2);
  });

  it('filters by year range', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все марки');
    await user.selectOptions(screen.getAllByRole('combobox')[2], '2021');
    await getSubtitleCount(4);
  });

  it('filters by deals only', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все марки');
    await user.click(screen.getByRole('checkbox'));
    await screen.findByText(/объявлений/);
  });

  it('renders stats row', async () => {
    render(<App />);
    await screen.findByText('Объявлений');
    expect(screen.getByText('Средняя цена')).toBeInTheDocument();
    expect(screen.getByText('Средний пробег')).toBeInTheDocument();
    expect(screen.getByText('Выгодных сделок')).toBeInTheDocument();
  });

  it('renders charts section', async () => {
    render(<App />);
    await screen.findByText('Средняя цена по маркам (Топ-10)');
    expect(screen.getByText('Пробег vs Цена')).toBeInTheDocument();
    expect(screen.getByText('Год выпуска vs Средняя цена')).toBeInTheDocument();
    expect(screen.getByText('Топ-10 популярных моделей')).toBeInTheDocument();
  });

  it('renders deals section', async () => {
    render(<App />);
    expect(await screen.findByText(/Лучшие предложения/)).toBeInTheDocument();
  });

  it('renders model tiles', async () => {
    render(<App />);
    expect((await screen.findAllByText('Toyota Camry')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('BMW X5').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Lada Granta').length).toBeGreaterThanOrEqual(1);
  });

  it('resets body type when switching to "all"', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все марки');

    const bodySelect = screen.getAllByRole('combobox')[4];
    await user.selectOptions(bodySelect, 'Седан');
    await getSubtitleCount(4);

    await user.selectOptions(bodySelect, 'all');
    await getSubtitleCount(6);
  });
});

describe('Малоездные авто section', () => {
  const cy = new Date().getFullYear();
  const annualOf = (year, mileage) => Math.round(mileage / Math.max(1, cy - year));

  it('renders header with count badge and slider', async () => {
    render(<App />);
    await screen.findByText('Малоездные авто');
    const sliders = screen.getAllByRole('slider');
    expect(sliders[2]).toBeInTheDocument();
    expect(document.querySelector('.count-badge')).toHaveTextContent('6');
  });

  it('sorts cards by annual mileage ascending', async () => {
    render(<App />);
    await screen.findByText('Малоездные авто');
    const cards = document.querySelectorAll('.usage-card');
    expect(cards).toHaveLength(6);
    const first = within(cards[0]);
    expect(first.getByText('Lada Granta')).toBeInTheDocument();
    const grantaBadge = formatAnnual(annualOf(2023, 5000)).replace(/\u00A0/g, ' ');
    expect(first.getByText(grantaBadge)).toBeInTheDocument();
  });

  it('filters cards by slider threshold', async () => {
    render(<App />);
    await screen.findByText('Малоездные авто');
    const slider = screen.getAllByRole('slider')[2];

    fireEvent.change(slider, { target: { value: '5500' } });

    const expectedCount = [
      annualOf(2023, 5000),
      annualOf(2022, 20000),
      annualOf(2021, 30000),
      annualOf(2021, 40000),
      annualOf(2020, 50000),
      annualOf(2019, 70000),
    ].filter(a => a <= 5500).length;
    expect(document.querySelectorAll('.usage-card')).toHaveLength(expectedCount);
    expect(document.querySelectorAll('.usage-card .annual-badge')).toHaveLength(expectedCount);
  });
});

describe('Источник filter', () => {
  const mixed = [
    ...offers,
    { id: 101, source: 'rolf', brand: 'BMW', model: 'X5', year: 2022, price: 5100000, mileage: 22000, bodyType: 'Внедорожник', fuelType: 'Дизель', engineVolume: 3.0, horsepower: 286, url: 'https://rolf.ru/101', image: '' },
    { id: 102, source: 'rolf', brand: 'Lada', model: 'Granta', year: 2023, price: 850000, mileage: 4000, bodyType: 'Седан', fuelType: 'Бензин', engineVolume: 1.6, horsepower: 98, url: 'https://rolf.ru/102', image: '' },
  ];

  it('переключает объявления и подпись по источнику', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => {
        if (url === '/api/offers') return Promise.resolve(mixed);
        if (url === '/api/meta') return Promise.resolve({ sources: ['major-expert', 'rolf'], brands: [], years: [] });
        return Promise.resolve({ dates: [], byDate: {} });
      },
    })));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все источники');
    screen.getByRole('option', { name: 'major-expert.ru' });
    screen.getByRole('option', { name: 'rolf.ru' });
    await user.selectOptions(screen.getByLabelText('Источник'), 'rolf');
    await screen.findByText(/2 объявлений/);
  });
});

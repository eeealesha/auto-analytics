import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SourceComparison from './SourceComparison';

const sources = ['major-expert', 'rolf'];

const pair = {
  'major-expert': { id: 1, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3, mileage: 40000, price: 4500000, horsepower: 286, transmission: 'АКПП', driveType: 'Полный привод', color: 'серый', owners: 1, url: 'https://me.ru/1', image: '' },
  rolf: { id: 2, source: 'rolf', brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3, mileage: 30000, price: 4200000, horsepower: 286, transmission: 'АКПП', driveType: 'Полный привод', color: 'чёрный', owners: null, url: 'https://rolf.ru/2', image: '' },
};

describe('SourceComparison', () => {
  it('показывает пустое состояние при отсутствии пар', () => {
    render(<SourceComparison cars={[{ id: 1, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3 }]} sources={sources} />);
    expect(screen.getByText(/Нет авто, встречающихся на обоих источниках/)).toBeInTheDocument();
  });

  it('рендерит пару с двумя колонками', () => {
    render(<SourceComparison cars={[pair['major-expert'], pair.rolf]} sources={sources} />);
    expect(screen.getByText('Сравнение источников')).toBeInTheDocument();
    expect(screen.getByText(/major-expert/)).toBeInTheDocument();
    expect(screen.getByText(/rolf/)).toBeInTheDocument();
  });

  it('показывает отформатированные цены и пробег', () => {
    render(<SourceComparison cars={[pair['major-expert'], pair.rolf]} sources={sources} />);
    expect(screen.getByText(/4\s+200\s+000/)).toBeInTheDocument();
    expect(screen.getByText(/4\s+500\s+000/)).toBeInTheDocument();
    expect(screen.getByText(/30\s+000\s+км/)).toBeInTheDocument();
    expect(screen.getByText(/40\s+000\s+км/)).toBeInTheDocument();
  });

  it('подсвечивает более дешёвую цену и меньший пробег', () => {
    render(<SourceComparison cars={[pair['major-expert'], pair.rolf]} sources={sources} />);
    const tables = document.querySelectorAll('.cmp-table');
    expect(tables.length).toBe(2);

    const rolfPriceRow = tables[1].querySelector('tr:first-child');
    expect(rolfPriceRow.className).toContain('cmp-hl');

    const meMileageRow = tables[0].querySelectorAll('tr')[1];
    expect(meMileageRow.className).not.toContain('cmp-hl');

    const rolfMileageRow = tables[1].querySelectorAll('tr')[1];
    expect(rolfMileageRow.className).toContain('cmp-hl');
  });

  it('не показывает пары без второго источника', () => {
    const onlyOne = [{ id: 1, source: 'major-expert', brand: 'Toyota', model: 'Camry', year: 2020, engineVolume: 2.5, mileage: 10000, price: 2000000 }];
    render(<SourceComparison cars={onlyOne} sources={sources} />);
    expect(screen.getByText(/Нет авто, встречающихся на обоих источниках/)).toBeInTheDocument();
  });
});

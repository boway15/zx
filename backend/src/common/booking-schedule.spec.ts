import { getSelectableStartDates, enumerateDatesFromStart } from './booking-schedule';
import { ProductType, Product } from '../entities/product.entity';

function makeProduct(type: ProductType, durationHours: number): Product {
  return {
    id: 'p1',
    name: 'test',
    type,
    durationHours,
    priceFen: 100,
    enabled: true,
    createdAt: new Date(),
  } as Product;
}

describe('booking-schedule', () => {
  it('enumerates consecutive dates from start', () => {
    expect(enumerateDatesFromStart('2026-06-01', 3)).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
    ]);
  });

  it('limits selectable start dates by redeem deadline', () => {
    const product = makeProduct(ProductType.DAY, 24);
    const redeemValidUntil = new Date('2026-06-03T23:59:59.999+08:00');
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T10:00:00+08:00'));

    const dates = getSelectableStartDates(product, redeemValidUntil);
    expect(dates).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);

    jest.useRealTimers();
  });
});

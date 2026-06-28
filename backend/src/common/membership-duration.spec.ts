import {
  calculateMembershipEnd,
  calculateNaturalDayExpiry,
  getNaturalDays,
} from './membership-duration';
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

describe('membership-duration', () => {
  it('derives natural days from durationHours', () => {
    expect(getNaturalDays(makeProduct(ProductType.DAY, 48))).toBe(2);
  });

  it('calculates natural day expiry inclusive of start day', () => {
    const start = new Date('2026-06-01T12:00:00+08:00');
    const end = calculateNaturalDayExpiry(start, 2);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getDate()).toBe(2);
  });

  it('calculates membership end from activation date', () => {
    const startAt = new Date('2026-06-01T00:00:00+08:00');
    const endAt = calculateMembershipEnd(startAt, makeProduct(ProductType.WEEK, 168));
    expect(endAt.getDate()).toBe(7);
    expect(endAt.getHours()).toBe(23);
  });
});

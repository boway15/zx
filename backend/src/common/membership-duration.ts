import { Product, ProductType } from '../entities/product.entity';

export function getNaturalDays(type: ProductType): number {
  switch (type) {
    case ProductType.DAY:
      return 1;
    case ProductType.WEEK:
      return 7;
    case ProductType.MONTH:
      return 30;
    default:
      return 1;
  }
}

export function startOfNaturalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfNaturalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** 按自然日计算会员卡到期时间（含起始日当天） */
export function calculateMembershipEnd(startAt: Date, product: Product): Date {
  const days = getNaturalDays(product.type);
  const endDay = new Date(startOfNaturalDay(startAt));
  endDay.setDate(endDay.getDate() + days - 1);
  return endOfNaturalDay(endDay);
}

/** 续卡时从上一张卡到期日的次日 00:00 起算 */
export function nextMembershipStartAfter(existingEndAt: Date): Date {
  const next = new Date(existingEndAt);
  next.setDate(next.getDate() + 1);
  return startOfNaturalDay(next);
}

import { Product, ProductType } from '../entities/product.entity';

/** 卡类型默认自然日（durationHours 未设置时的兜底） */
const TYPE_DEFAULT_DAYS: Record<ProductType, number> = {
  [ProductType.DAY]: 1,
  [ProductType.WEEK]: 7,
  [ProductType.MONTH]: 30,
};

/**
 * 会员卡有效自然日数（按天，不按小时）。
 * 1 天 = 激活当天至 23:59；2 天 = 激活日 + 次日，至次日 23:59。
 * durationHours 按「自然日 × 24」存储，例如 48 表示 2 个自然日。
 */
export function getNaturalDays(product: Product): number {
  if (product.durationHours > 0) {
    return Math.max(1, Math.round(product.durationHours / 24));
  }
  return TYPE_DEFAULT_DAYS[product.type] ?? 1;
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

/** 按自然日计算到期时间（含起始日当天，截止最后一天 23:59:59） */
export function calculateNaturalDayExpiry(from: Date, days: number): Date {
  const endDay = new Date(startOfNaturalDay(from));
  endDay.setDate(endDay.getDate() + days - 1);
  return endOfNaturalDay(endDay);
}

/** 按自然日计算会员卡到期时间（含激活日当天） */
export function calculateMembershipEnd(startAt: Date, product: Product): Date {
  return calculateNaturalDayExpiry(startAt, getNaturalDays(product));
}

/** 续卡时从上一张卡到期日的次日 00:00 起算 */
export function nextMembershipStartAfter(existingEndAt: Date): Date {
  const next = new Date(existingEndAt);
  next.setDate(next.getDate() + 1);
  return startOfNaturalDay(next);
}

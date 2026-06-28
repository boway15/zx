import { Product, ProductType } from '../entities/product.entity';
import { getNaturalDays, startOfNaturalDay } from './membership-duration';

/** 可选起始日的向前窗口：日卡/周卡 7 天，月卡 30 天 */
export function getBookingHorizonDays(product: Product): number {
  if (product.type === ProductType.MONTH) return 30;
  return 7;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateStr(dateStr: string): Date {
  return startOfNaturalDay(new Date(`${dateStr}T12:00:00`));
}

/** 从起始日起连续 N 个自然日（含起始日） */
export function enumerateDatesFromStart(startDateStr: string, dayCount: number): string[] {
  const dates: string[] = [];
  const cur = parseDateStr(startDateStr);
  for (let i = 0; i < dayCount; i++) {
    dates.push(localDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** 会员卡覆盖的全部自然日 */
export function getMembershipDateRange(startAt: Date, product: Product): string[] {
  return enumerateDatesFromStart(localDateStr(startAt), getNaturalDays(product));
}

/** 在兑换码有效期内、向前 horizon 天内的可选起始日 */
export function getSelectableStartDates(
  product: Product,
  redeemValidUntil: Date,
): string[] {
  const horizon = getBookingHorizonDays(product);
  const today = startOfNaturalDay(new Date());
  const lastRedeemDay = startOfNaturalDay(redeemValidUntil);
  const dates: string[] = [];

  for (let i = 0; i < horizon; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d > lastRedeemDay) break;
    dates.push(localDateStr(d));
  }
  return dates;
}

export function assertStartDateSelectable(
  startDateStr: string,
  product: Product,
  redeemValidUntil: Date,
) {
  const allowed = getSelectableStartDates(product, redeemValidUntil);
  if (!allowed.includes(startDateStr)) {
    throw new Error('所选起始日不在可预约范围内');
  }
}

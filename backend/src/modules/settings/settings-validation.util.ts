import { BadRequestException } from '@nestjs/common';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function assertValidBusinessTime(value: string, label: string): void {
  if (!TIME_PATTERN.test(value)) {
    throw new BadRequestException(`${label}格式无效，请使用 HH:mm`);
  }
}

export function validateSettingsPayload(settings: Record<string, string>): void {
  if (settings.business_hours_start !== undefined) {
    assertValidBusinessTime(settings.business_hours_start, '营业开始时间');
  }
  if (settings.business_hours_end !== undefined) {
    assertValidBusinessTime(settings.business_hours_end, '营业结束时间');
  }

  const start = settings.business_hours_start;
  const end = settings.business_hours_end;
  if (start && end) {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    if (startMinutes > endMinutes) {
      throw new BadRequestException('营业时间不支持跨天，结束时间必须晚于开始时间');
    }
  }
}

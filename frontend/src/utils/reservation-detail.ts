import api, { ApiResponse } from '@/api';
import {
  showEmptyReservationDetailDialog,
  showReservationDetailDialog,
} from '@/composables/reservationDetailDialog';

export interface ReservationDetail {
  seatLabel: string;
  reserveDate?: string;
  multiDay?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  dayCount?: number;
  hasTodayReservation?: boolean;
  assignments?: { date: string; seatLabel: string; isPreferred: boolean }[];
}

export function showReservationDetail(reservation: ReservationDetail) {
  return showReservationDetailDialog(reservation);
}

export async function fetchAndShowReservationDetail() {
  const res = await api.get<ApiResponse<ReservationDetail | null>>('/seats/my');
  if (!res.data) {
    await showEmptyReservationDetailDialog();
    return null;
  }
  await showReservationDetail(res.data);
  return res.data;
}

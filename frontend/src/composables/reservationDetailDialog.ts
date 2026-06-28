import { ref, shallowRef } from 'vue';
import type { ReservationDetail } from '@/utils/reservation-detail';

type DialogMode = 'detail' | 'empty';

const visible = ref(false);
const mode = ref<DialogMode>('detail');
const reservation = shallowRef<ReservationDetail | null>(null);
let closeHandler: (() => void) | null = null;

function openDialog(nextMode: DialogMode, data: ReservationDetail | null) {
  mode.value = nextMode;
  reservation.value = data;
  visible.value = true;
  return new Promise<void>((resolve) => {
    closeHandler = resolve;
  });
}

export function showReservationDetailDialog(data: ReservationDetail) {
  return openDialog('detail', data);
}

export function showEmptyReservationDetailDialog() {
  return openDialog('empty', null);
}

export function confirmReservationDetailDialog() {
  visible.value = false;
  closeHandler?.();
  closeHandler = null;
}

export function useReservationDetailDialog() {
  return {
    visible,
    mode,
    reservation,
    confirmReservationDetailDialog,
  };
}

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api, { ApiResponse } from '@/api';
import { useSessionStore } from '@/stores/session';
import { showSuccessToast } from 'vant';
import { fetchAndShowReservationDetail } from '@/utils/reservation-detail';
import ReservationPlanPanel from '@/components/ReservationPlanPanel.vue';

const props = defineProps<{
  active?: boolean;
}>();

const emit = defineEmits<{
  reserved: [];
}>();

interface BookingInfo {
  pending: boolean;
  multiDay: boolean;
  productType: string;
  productName: string;
  dateFrom: string | null;
  dateTo: string | null;
  dayCount: number;
  selectableStartDates: string[];
  selectedStartDate: string;
  bookingHorizonDays: number;
}

interface RoomAvailability {
  id: string;
  code: string;
  name: string;
  seats: {
    id: string;
    seatNo: number;
    label: string;
    bookable: boolean;
    reserved: boolean;
    isMine: boolean;
    reservedByOther: boolean;
    partiallyReservedByOther: boolean;
    available: boolean;
  }[];
}

interface MyReservation {
  seatLabel: string;
  reserveDate: string;
  multiDay?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  dayCount?: number;
  hasTodayReservation?: boolean;
  assignments?: { date: string; seatLabel: string; isPreferred: boolean }[];
  membership?: {
    status: string;
    pending: boolean;
    startAt: string | null;
    endAt: string | null;
  };
}

interface PlanAssignment {
  date: string;
  seatLabel: string;
  isPreferred: boolean;
}

const session = useSessionStore();
const booking = ref<BookingInfo | null>(null);
const rooms = ref<RoomAvailability[]>([]);
const myReservation = ref<MyReservation | null>(null);
const reserving = ref<string | null>(null);
const expandedRoom = ref<string[]>([]);
const selectedStartDate = ref('');
const planDialogVisible = ref(false);
const planDialogTitle = ref('');
const planDialogAssignments = ref<PlanAssignment[]>([]);
const planDialogBooking = ref<BookingInfo | null>(null);
let planDialogConfirm: (() => void) | null = null;
let planDialogCancel: (() => void) | null = null;

const showDateTabs = computed(() => {
  if (!booking.value || !dateTabs.value.length) return false;
  if (booking.value.pending) return true;
  return booking.value.multiDay && dateTabs.value.length > 1;
});

function todayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const dateTabs = computed(() => {
  const dates = booking.value?.selectableStartDates || [];
  const today = todayDateStr();
  return dates.map((date) => ({
    date,
    label: date === today ? `今天 ${formatShortDate(date)}` : formatShortDate(date),
  }));
});

const bookingHint = computed(() => {
  if (!booking.value) return '';
  if (booking.value.pending) {
    if (booking.value.multiDay) {
      return `请选择起始日期并选座，确认后激活 ${booking.value.dayCount} 天会员卡（不可改日期）`;
    }
    return '请选择使用日期并选座，确认后激活会员卡（不可改日期）';
  }
  if (!booking.value.multiDay) {
    return '日卡：可更换座位，不可修改日期';
  }
  const { dateFrom, dateTo, dayCount } = booking.value;
  return `周卡/月卡：${dateFrom} 至 ${dateTo}（${dayCount} 天）· 可换座不可改日期`;
});

const mySeatText = computed(() => {
  if (!myReservation.value) return '';
  const { seatLabel, multiDay, dateFrom, dateTo, dayCount, assignments } = myReservation.value;
  const mixed = assignments?.some((a) => !a.isPreferred);
  if (multiDay && dateFrom && dateTo && dayCount) {
    return mixed
      ? `已预约 ${dayCount} 天（${dateFrom} 至 ${dateTo}），部分日期座位不同`
      : `固定座位 ${seatLabel} · ${dayCount} 天（${dateFrom} 至 ${dateTo}）`;
  }
  return `今日座位：${seatLabel}（可更换座位）`;
});

function syncSessionReservation(data: MyReservation | null) {
  if (!data) return;
  session.updateReservation({
    seatLabel: data.seatLabel,
    reserveDate: data.reserveDate,
    multiDay: data.multiDay,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    dayCount: data.dayCount,
    hasTodayReservation: data.hasTodayReservation,
    assignments: data.assignments,
  });
  if (data.membership && !data.membership.pending) {
    session.updateMembership({
      pending: false,
      status: data.membership.status,
      startAt: data.membership.startAt,
      endAt: data.membership.endAt,
    });
  }
}

async function showMyReservationDetail() {
  const data = await fetchAndShowReservationDetail();
  if (data) {
    myReservation.value = { ...myReservation.value, ...data } as MyReservation;
    syncSessionReservation(data as MyReservation);
  }
}

async function load() {
  try {
    const [avail, my] = await Promise.all([
      api.get<ApiResponse<{ booking: BookingInfo; rooms: RoomAvailability[] }>>('/seats/availability', {
        params: selectedStartDate.value ? { startDate: selectedStartDate.value } : undefined,
      }),
      api.get<ApiResponse<MyReservation | null>>('/seats/my'),
    ]);
    booking.value = avail.data.booking;
    rooms.value = avail.data.rooms;
    myReservation.value = my.data;
    if (booking.value.selectedStartDate) {
      selectedStartDate.value = booking.value.selectedStartDate;
    }
    if (my.data) {
      syncSessionReservation(my.data);
    }
    if (rooms.value.length && !expandedRoom.value.length) {
      expandedRoom.value = [rooms.value[0].code];
    }
  } catch {
    // 保留已有数据，避免切换 tab 后整页空白
  }
}

function onStartDateChange() {
  load();
}

watch(
  () => props.active,
  (visible) => {
    if (visible) {
      load();
    }
  },
);

function formatShortDate(date: string) {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

const SEAT_SLOT_LABEL = {
  selectable: '可选',
  selected: '我的座位',
  occupied: '已被预约',
  partiallyOccupied: '部分已约',
  closed: '暂不可选',
} as const;

type SeatSlotStatus = keyof typeof SEAT_SLOT_LABEL;

function seatSlotStatus(seat: RoomAvailability['seats'][number]): SeatSlotStatus {
  if (!seat.bookable) return 'closed';
  if (seat.isMine) return 'selected';
  if (seat.reservedByOther) return 'occupied';
  if (seat.partiallyReservedByOther) return 'partiallyOccupied';
  return 'selectable';
}

function seatStatusLabel(seat: RoomAvailability['seats'][number]) {
  return SEAT_SLOT_LABEL[seatSlotStatus(seat)];
}

function openPlanConfirmDialog(
  title: string,
  assignments: PlanAssignment[],
  bookingInfo: BookingInfo,
) {
  return new Promise<void>((resolve, reject) => {
    planDialogTitle.value = title;
    planDialogAssignments.value = assignments;
    planDialogBooking.value = bookingInfo;
    planDialogConfirm = resolve;
    planDialogCancel = reject;
    planDialogVisible.value = true;
  });
}

function closePlanConfirmDialog(confirmed: boolean) {
  planDialogVisible.value = false;
  if (confirmed) {
    planDialogConfirm?.();
  } else {
    planDialogCancel?.();
  }
  planDialogConfirm = null;
  planDialogCancel = null;
}

function onPlanDialogConfirm() {
  closePlanConfirmDialog(true);
}

function onPlanDialogCancel() {
  closePlanConfirmDialog(false);
}

async function reserve(seatId: string, label: string) {
  reserving.value = seatId;
  try {
    const startDatePayload = booking.value?.pending
      ? selectedStartDate.value || booking.value?.selectedStartDate
      : undefined;

    const previewRes = await api.post<ApiResponse<{
      booking: BookingInfo;
      assignments: PlanAssignment[];
      allSameSeat: boolean;
    }>>('/seats/preview-plan', {
      seatId,
      ...(startDatePayload ? { startDate: startDatePayload } : {}),
    });

    const { assignments, booking: previewBooking } = previewRes.data;
    const title = booking.value?.pending ? '确认预约并激活' : '确认更换座位';

    try {
      await openPlanConfirmDialog(title, assignments, previewBooking);
    } catch {
      return;
    }

    const res = await api.post<ApiResponse<MyReservation>>('/seats/reserve', {
      seatId,
      ...(startDatePayload ? { startDate: startDatePayload } : {}),
    });
    const data = res.data;

    if (data.membership && !data.membership.pending) {
      session.updateMembership({
        pending: false,
        status: data.membership.status,
        startAt: data.membership.startAt,
        endAt: data.membership.endAt,
      });
    }

    if (data.multiDay && data.dayCount) {
      const mixed = data.assignments?.some((a) => !a.isPreferred);
      showSuccessToast(mixed ? `已预约 ${data.dayCount} 天（部分日期座位不同）` : `已固定 ${label} · ${data.dayCount} 天`);
    } else {
      showSuccessToast(booking.value?.pending ? `已预约 ${label}，会员卡已激活` : `已更换为 ${label}`);
    }

    myReservation.value = data;
    syncSessionReservation(data);
    await load();
    emit('reserved');
  } finally {
    reserving.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="seat-booking">
    <van-notice-bar
      wrapable
      :scrollable="false"
      :text="bookingHint"
      color="#646566"
      background="#f7f8fa"
    />

    <div v-if="showDateTabs" class="date-tabs-wrap">
      <p class="date-picker-label">
        {{ booking?.pending ? (booking.multiDay ? '选择起始日期' : '选择使用日期') : '选择日期查看座位' }}
        <span v-if="booking?.pending" class="date-picker-hint">（近 {{ booking.bookingHorizonDays }} 天内）</span>
      </p>
      <van-tabs
        v-model:active="selectedStartDate"
        swipeable
        shrink
        class="date-tabs"
        @change="onStartDateChange"
      >
        <van-tab
          v-for="tab in dateTabs"
          :key="tab.date"
          :name="tab.date"
          :title="tab.label"
        />
      </van-tabs>
    </div>

    <van-notice-bar
      v-if="myReservation"
      wrapable
      :scrollable="false"
      :text="mySeatText"
      color="#07a35a"
      background="#e8faf0"
    />
    <div v-if="myReservation" class="detail-entry-wrap">
      <button type="button" class="detail-entry-btn" @click="showMyReservationDetail">
        查看我的预约详情
      </button>
    </div>

    <van-collapse v-model="expandedRoom">
      <van-collapse-item
        v-for="room in rooms"
        :key="room.id"
        :title="`${room.code} 教室（${room.seats.filter(s => s.available).length}/${room.seats.length} 可选）`"
        :name="room.code"
      >
        <div class="seat-grid">
          <button
            v-for="seat in room.seats"
            :key="seat.id"
            class="seat-btn"
            :class="{
              available: seat.available,
              mine: seat.isMine,
              others: seat.reservedByOther,
              partial: seat.partiallyReservedByOther,
              closed: !seat.bookable,
            }"
            :disabled="!seat.available || reserving === seat.id"
            @click="reserve(seat.id, seat.label)"
          >
            <span class="no">{{ seat.seatNo }}</span>
            <span class="status">{{ seatStatusLabel(seat) }}</span>
          </button>
        </div>
      </van-collapse-item>
    </van-collapse>

    <ul class="legend">
      <li><span class="swatch mine" />我的座位</li>
      <li><span class="swatch available" />可选</li>
      <li><span class="swatch partial" />部分已约</li>
      <li><span class="swatch others" />已被预约/暂不可选</li>
    </ul>

    <van-dialog
      v-model:show="planDialogVisible"
      :title="planDialogTitle"
      show-cancel-button
      confirm-button-text="确认"
      cancel-button-text="取消"
      class="plan-confirm-dialog"
      @confirm="onPlanDialogConfirm"
      @cancel="onPlanDialogCancel"
    >
      <ReservationPlanPanel
        :assignments="planDialogAssignments"
        footnote="确认后不可取消或修改日期，仅支持更换座位。"
      >
        <template v-if="planDialogBooking" #meta>
          <p class="plan-meta">卡类型：{{ planDialogBooking.productName }}</p>
          <p class="plan-meta">
            使用日期：{{ planDialogBooking.dateFrom }} 至 {{ planDialogBooking.dateTo }}
          </p>
        </template>
      </ReservationPlanPanel>
    </van-dialog>
  </div>
</template>

<style scoped>
.seat-booking {
  padding: 8px 0 24px;
}
.date-tabs-wrap {
  padding: 12px 16px 4px;
}
.date-picker-label {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--tt-text, #222);
}
.date-picker-hint {
  font-size: 12px;
  color: var(--tt-text-secondary, #999);
}
.date-tabs {
  margin: 0 -16px;
}
.detail-entry-wrap {
  padding: 0 16px 8px;
  text-align: center;
}
.detail-entry-btn {
  border: none;
  background: none;
  color: #07a35a;
  font-size: 13px;
  padding: 4px 0;
}
.seat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 8px 4px;
}
.seat-btn {
  border: 1px solid var(--tt-border, #eeeeee);
  border-radius: 6px;
  padding: 10px 4px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 12px;
  color: var(--tt-text-secondary, #999);
}
.seat-btn .no {
  font-size: 16px;
  font-weight: 600;
  color: var(--tt-text, #222);
}
.seat-btn.available {
  background: #fff;
  border-color: #f85959;
  color: #f85959;
}
.seat-btn.available .no {
  color: #f85959;
}
.seat-btn.mine {
  background: #07c160;
  border-color: #07c160;
  color: #fff;
  box-shadow: 0 0 0 2px rgba(7, 193, 96, 0.25);
}
.seat-btn.mine .no {
  color: #fff;
}
.seat-btn.mine .status {
  font-weight: 600;
}
.seat-btn.others {
  background: #f5f5f5;
  border: 1px solid #c8c9cc;
  color: #969799;
}
.seat-btn.others .no {
  color: #969799;
}
.seat-btn.closed {
  background: #f5f5f5;
  border: 1px solid #dcdee0;
  opacity: 0.45;
}
.seat-btn.partial {
  background: #fff7e8;
  border-color: #ed6a0c;
  color: #ed6a0c;
}
.seat-btn.partial .no {
  color: #ed6a0c;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px 14px;
  list-style: none;
  margin: 0;
  padding: 12px 16px;
  font-size: 11px;
  color: #969799;
}
.legend li {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}
.swatch.mine {
  background: #07c160;
}
.swatch.available {
  background: #fff;
  border: 2px solid #f85959;
}
.swatch.partial {
  background: #fff7e8;
  border: 1px solid #ed6a0c;
}
.swatch.others {
  background: #f5f5f5;
  border: 1px solid #c8c9cc;
}

:deep(.plan-confirm-dialog .van-dialog__message) {
  padding: 0;
}
</style>

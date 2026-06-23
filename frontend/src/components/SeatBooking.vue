<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api, { ApiResponse } from '@/api';
import { useSessionStore } from '@/stores/session';
import { showSuccessToast } from 'vant';

interface BookingInfo {
  multiDay: boolean;
  productType: string;
  productName: string;
  dateFrom: string | null;
  dateTo: string | null;
  dayCount: number;
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
}

const session = useSessionStore();
const booking = ref<BookingInfo | null>(null);
const rooms = ref<RoomAvailability[]>([]);
const myReservation = ref<MyReservation | null>(null);
const reserving = ref<string | null>(null);
const expandedRoom = ref<string[]>([]);

const bookingHint = computed(() => {
  if (!booking.value?.multiDay) {
    return '日卡：预约今日座位，每日需单独预约';
  }
  const { dateFrom, dateTo, dayCount } = booking.value;
  if (!dateFrom || !dateTo || !dayCount) {
    return '周卡/月卡：选择座位后将固定预约有效期内剩余天数';
  }
  return `周卡/月卡：选择座位后将固定 ${dayCount} 天（${dateFrom} 至 ${dateTo}）`;
});

const mySeatText = computed(() => {
  if (!myReservation.value) return '';
  const { seatLabel, multiDay, dateFrom, dateTo, dayCount } = myReservation.value;
  if (multiDay && dateFrom && dateTo && dayCount) {
    return `已固定座位 ${seatLabel} · ${dayCount} 天（${dateFrom} 至 ${dateTo}）`;
  }
  return `您今日已预约：${seatLabel}（可重新选择变更）`;
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
  });
}

async function load() {
  const [avail, my] = await Promise.all([
    api.get<ApiResponse<{ booking: BookingInfo; rooms: RoomAvailability[] }>>('/seats/availability'),
    api.get<ApiResponse<MyReservation | null>>('/seats/my'),
  ]);
  booking.value = avail.data.booking;
  rooms.value = avail.data.rooms;
  myReservation.value = my.data;
  if (my.data) {
    syncSessionReservation(my.data);
  }
  if (rooms.value.length && !expandedRoom.value.length) {
    expandedRoom.value = [rooms.value[0].code];
  }
}

function seatStatus(seat: RoomAvailability['seats'][number]) {
  if (!seat.bookable) return '不可约';
  if (seat.isMine) return '已固定';
  if (seat.reservedByOther) return '别人已约';
  return '可约';
}

async function reserve(seatId: string, label: string) {
  reserving.value = seatId;
  try {
    const res = await api.post<ApiResponse<MyReservation>>('/seats/reserve', { seatId });
    const data = res.data;
    if (data.multiDay && data.dayCount) {
      showSuccessToast(`已固定 ${label} · ${data.dayCount} 天`);
    } else {
      showSuccessToast(`已预约 ${label}`);
    }
    myReservation.value = data;
    syncSessionReservation(data);
    await load();
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
    <van-notice-bar
      v-if="myReservation"
      wrapable
      :scrollable="false"
      :text="mySeatText"
      color="#f85959"
      background="#fff7f7"
    />

    <van-collapse v-model="expandedRoom">
      <van-collapse-item
        v-for="room in rooms"
        :key="room.id"
        :title="`${room.code} 教室（${room.seats.filter(s => s.available).length}/${room.seats.length} 可约）`"
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
              disabled: !seat.available && !seat.isMine,
            }"
            :disabled="!seat.available || reserving === seat.id"
            @click="reserve(seat.id, seat.label)"
          >
            <span class="no">{{ seat.seatNo }}</span>
            <span class="status">{{ seatStatus(seat) }}</span>
          </button>
        </div>
      </van-collapse-item>
    </van-collapse>

    <p class="legend">
      灰色=不可约/别人已约 · 红色边框=可预约 · 红色实心=您的固定座位
    </p>
  </div>
</template>

<style scoped>
.seat-booking {
  padding: 8px 0 24px;
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
  background: #f85959;
  border-color: #f85959;
  color: #fff;
}
.seat-btn.mine .no {
  color: #fff;
}
.seat-btn.others {
  background: #f5f5f5;
  opacity: 0.65;
}
.seat-btn.disabled {
  opacity: 0.5;
}
.legend {
  font-size: 11px;
  color: #969799;
  padding: 12px 16px;
  text-align: center;
}
</style>

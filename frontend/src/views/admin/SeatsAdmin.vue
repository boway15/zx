<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';
import { showSuccessToast } from 'vant';

interface RoomSeats {
  code: string;
  name: string;
  seats: { id: string; seatNo: number; label: string; bookable: boolean }[];
}

const rooms = ref<RoomSeats[]>([]);
const activeNames = ref(['301']);

async function load() {
  const res = await api.get<ApiResponse<RoomSeats[]>>('/seats/admin/all');
  rooms.value = res.data;
}

async function toggle(seatId: string, bookable: boolean) {
  await api.put(`/seats/admin/${seatId}/bookable`, { bookable: !bookable });
  showSuccessToast(!bookable ? '已开放预约' : '已关闭预约');
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <h3>座位管理</h3>
    <p class="tip">关闭后用户将无法预约该座位（维修、预留等）</p>

    <van-collapse v-model="activeNames">
      <van-collapse-item
        v-for="room in rooms"
        :key="room.code"
        :title="`${room.code} · ${room.seats.length} 座`"
        :name="room.code"
      >
        <van-cell
          v-for="s in room.seats"
          :key="s.id"
          :title="s.label"
          :value="s.bookable ? '可预约' : '不可约'"
        >
          <template #right-icon>
            <van-switch
              :model-value="s.bookable"
              size="20"
              @update:model-value="toggle(s.id, s.bookable)"
            />
          </template>
        </van-cell>
      </van-collapse-item>
    </van-collapse>
  </div>
</template>

<style scoped>
h3 { margin-bottom: 8px; }
.tip { font-size: 12px; color: #969799; margin-bottom: 16px; }
</style>

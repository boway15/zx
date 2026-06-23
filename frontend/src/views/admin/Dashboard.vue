<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';

const stats = ref({ todayUnlocks: 0, activeMembers: 0 });

onMounted(async () => {
  const res = await api.get<ApiResponse<{ todayUnlocks: number; activeMembers: number }>>('/admin/dashboard');
  stats.value = res.data;
});
</script>

<template>
  <div>
    <h3>仪表盘</h3>
    <van-grid :column-num="2" :border="false">
      <van-grid-item>
        <div class="stat-value">{{ stats.todayUnlocks }}</div>
        <div class="stat-label">今日开门</div>
      </van-grid-item>
      <van-grid-item>
        <div class="stat-value">{{ stats.activeMembers }}</div>
        <div class="stat-label">有效会员</div>
      </van-grid-item>
    </van-grid>
  </div>
</template>

<style scoped>
h3 {
  margin-bottom: 16px;
  color: var(--tt-text);
}
.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: var(--tt-red);
}
.stat-label {
  font-size: 14px;
  color: var(--tt-text-secondary);
  margin-top: 4px;
}
</style>

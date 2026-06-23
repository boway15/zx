<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

function logout() {
  auth.adminLogout();
  router.push('/admin/login');
}
</script>

<template>
  <div class="admin-layout">
    <van-nav-bar title="管理后台" fixed placeholder>
      <template #right>
        <van-button size="small" @click="logout">退出</van-button>
      </template>
    </van-nav-bar>

    <van-grid :column-num="4" :border="false" class="nav-grid">
      <van-grid-item icon="chart-trending-o" text="仪表盘" to="/admin/dashboard" />
      <van-grid-item icon="coupon-o" text="卡价管理" to="/admin/products" />
      <van-grid-item icon="gift-o" text="核销兑换" to="/admin/redemption" />
      <van-grid-item icon="cluster-o" text="座位管理" to="/admin/seats" />
      <van-grid-item icon="todo-list-o" text="预约查看" to="/admin/reservations" />
      <van-grid-item icon="records" text="开门记录" to="/admin/logs" />
      <van-grid-item icon="setting-o" text="设置" to="/admin/settings" />
    </van-grid>

    <div class="content">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
  background: var(--tt-bg);
  color: var(--tt-text);
}
.nav-grid {
  margin: 8px 0;
}
.nav-grid :deep(.van-grid-item__content) {
  padding: 12px 4px;
}
.nav-grid :deep(.van-grid-item__text) {
  color: var(--tt-text);
  font-size: 12px;
}
.content {
  padding: 0 16px 24px;
}
</style>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import api, { ApiResponse } from '@/api';
import { showDialog } from 'vant';

interface RedemptionRecord {
  id: string;
  code: string;
  usedAt: string;
  product: { name: string };
}

const router = useRouter();
const auth = useAuthStore();
const records = ref<RedemptionRecord[]>([]);

async function loadRecords() {
  const res = await api.get<ApiResponse<RedemptionRecord[]>>('/redemption/my');
  records.value = res.data;
}

async function showPasscode() {
  try {
    const res = await api.get<ApiResponse<{ passcode: string; validTo: string }>>('/access/passcode');
    showDialog({
      title: '门锁备用密码',
      message: `密码：${res.data.passcode}\n\n有效期至：${new Date(res.data.validTo).toLocaleString('zh-CN')}`,
    });
  } catch {
    /* handled by interceptor */
  }
}

function logout() {
  auth.logout();
  router.push('/login');
}

onMounted(loadRecords);
</script>

<template>
  <div class="my-page">
    <van-nav-bar title="我的" fixed placeholder />

    <van-cell-group inset title="服务">
      <van-cell title="门锁备用密码" is-link @click="showPasscode" />
    </van-cell-group>

    <van-cell-group inset title="兑换记录">
      <van-cell
        v-for="r in records"
        :key="r.id"
        :title="r.product.name"
        :label="`兑换码 ${r.code} · ${new Date(r.usedAt).toLocaleString('zh-CN')}`"
      />
      <van-empty v-if="records.length === 0" description="暂无兑换记录" />
    </van-cell-group>

    <div class="actions">
      <van-button block round @click="logout">退出登录</van-button>
    </div>

    <van-tabbar route>
      <van-tabbar-item to="/home" icon="home-o">首页</van-tabbar-item>
      <van-tabbar-item to="/redeem" icon="gift-o">兑换</van-tabbar-item>
      <van-tabbar-item to="/my" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.my-page {
  min-height: 100vh;
  padding-bottom: 60px;
}
.actions {
  padding: 24px 16px;
}
</style>

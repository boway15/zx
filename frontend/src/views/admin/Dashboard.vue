<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';
import { showConfirmDialog, showDialog, showLoadingToast, closeToast, showSuccessToast } from 'vant';

const stats = ref({ todayUnlocks: 0, activeMembers: 0 });
const unlocking = ref(false);
const loadingPasscode = ref(false);

onMounted(async () => {
  const res = await api.get<ApiResponse<{ todayUnlocks: number; activeMembers: number }>>('/admin/dashboard');
  stats.value = res.data;
});

async function adminUnlock() {
  try {
    await showConfirmDialog({
      title: '强制开锁',
      message: '确认立即强制远程开门？不受营业时间、会员卡及预约限制。',
    });
  } catch {
    return;
  }

  unlocking.value = true;
  showLoadingToast({ message: '开门中...', forbidClick: true });
  try {
    const res = await api.post<ApiResponse<{ message: string }>>('/access/admin/unlock');
    showSuccessToast(res.message || res.data?.message || '开门成功');
  } finally {
    unlocking.value = false;
    closeToast();
  }
}

async function showTempPasscode() {
  loadingPasscode.value = true;
  showLoadingToast({ message: '获取临时密码...', forbidClick: true });
  try {
    const res = await api.get<ApiResponse<{ passcode: string; validDate: string; validTo: string }>>(
      '/access/admin/temp-passcode',
    );
    const { passcode, validDate, validTo } = res.data;
    showDialog({
      title: '今日临时密码',
      message: `密码：${passcode}\n\n有效期：${validDate}（当日有效）\n失效时间：${new Date(validTo).toLocaleString('zh-CN')}`,
      confirmButtonText: '知道了',
    });
  } finally {
    loadingPasscode.value = false;
    closeToast();
  }
}
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

    <div class="unlock-section">
      <van-button
        round
        block
        type="danger"
        size="large"
        icon="lock"
        :loading="unlocking"
        @click="adminUnlock"
      >
        强制开锁
      </van-button>
      <van-button
        round
        block
        plain
        type="primary"
        size="large"
        icon="eye-o"
        class="passcode-btn"
        :loading="loadingPasscode"
        @click="showTempPasscode"
      >
        查看临时密码
      </van-button>
      <p class="unlock-hint">强制开锁不受任何限制；临时密码仅当天有效，次日自动失效</p>
    </div>
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
.unlock-section {
  margin-top: 24px;
  padding: 0 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.passcode-btn {
  margin-top: 0;
}
.unlock-hint {
  margin-top: 0;
  font-size: 12px;
  color: var(--tt-text-secondary);
  text-align: center;
}
</style>

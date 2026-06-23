<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api, { ApiResponse } from '@/api';
import { showLoadingToast, closeToast, showDialog, showSuccessToast } from 'vant';

interface AccessStatus {
  hasActiveMembership: boolean;
  membership: {
    endAt: string;
    productName: string;
  } | null;
  passcode: string | null;
  businessHours: {
    start: string;
    end: string;
    isOpen: boolean;
  };
}

interface PublicSettings {
  storeName: string;
  businessHoursStart: string;
  businessHoursEnd: string;
}

const router = useRouter();
const status = ref<AccessStatus | null>(null);
const storeName = ref('自助自习室');
const unlocking = ref(false);

async function loadData() {
  const [statusRes, settingsRes] = await Promise.all([
    api.get<ApiResponse<AccessStatus>>('/access/status'),
    api.get<ApiResponse<PublicSettings>>('/settings/public'),
  ]);
  status.value = statusRes.data;
  storeName.value = settingsRes.data.storeName || '自助自习室';
}

async function unlock() {
  if (!status.value?.hasActiveMembership) {
    showDialog({ title: '提示', message: '您还没有有效会员卡，请先兑换' }).then(() => {
      router.push('/redeem');
    });
    return;
  }
  if (!status.value.businessHours.isOpen) {
    showDialog({ title: '提示', message: '当前非营业时间' });
    return;
  }

  unlocking.value = true;
  showLoadingToast({ message: '开门中...', forbidClick: true });
  try {
    const res = await api.post<ApiResponse<{ method: string; message: string; passcode?: string }>>('/access/unlock');
    closeToast();
    if (res.data.method === 'remote') {
      showSuccessToast('开门成功');
    } else if (res.data.passcode) {
      showDialog({
        title: '请使用备用密码',
        message: `远程开门失败，请在门锁键盘输入密码：\n\n${res.data.passcode}`,
        confirmButtonText: '知道了',
      });
    }
  } finally {
    unlocking.value = false;
    closeToast();
  }
}

function showPasscode() {
  if (!status.value?.passcode) return;
  showDialog({
    title: '门锁备用密码',
    message: status.value.passcode,
    confirmButtonText: '知道了',
  });
}

onMounted(loadData);
</script>

<template>
  <div class="home-page">
    <van-nav-bar :title="storeName" fixed placeholder />

    <van-notice-bar
      v-if="status"
      :text="`营业时间 ${status.businessHours.start} - ${status.businessHours.end}${status.businessHours.isOpen ? ' · 营业中' : ' · 已打烊'}`"
      left-icon="info-o"
    />

    <div class="card-section">
      <van-card v-if="status?.hasActiveMembership">
        <template #title>
          <van-tag type="success">会员有效</van-tag>
          {{ status.membership?.productName }}
        </template>
        <template #desc>
          有效期至：{{ new Date(status.membership!.endAt).toLocaleString('zh-CN') }}
        </template>
        <template #footer>
          <van-button v-if="status.passcode" size="small" plain type="primary" @click="showPasscode">
            查看门锁密码
          </van-button>
        </template>
      </van-card>
      <van-empty v-else description="暂无有效会员卡" image="search">
        <van-button type="primary" round @click="router.push('/redeem')">输入兑换码</van-button>
      </van-empty>
    </div>

    <div class="unlock-section">
      <button
        class="unlock-btn"
        :class="{ disabled: !status?.hasActiveMembership || unlocking }"
        :disabled="!status?.hasActiveMembership || unlocking"
        @click="unlock"
      >
        {{ unlocking ? '开门中...' : '开 门' }}
      </button>
      <p class="unlock-hint">点击远程开门，失败时将显示备用密码</p>
    </div>

    <van-tabbar route>
      <van-tabbar-item to="/home" icon="home-o">首页</van-tabbar-item>
      <van-tabbar-item to="/redeem" icon="gift-o">兑换</van-tabbar-item>
      <van-tabbar-item to="/my" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  padding-bottom: 60px;
}
.card-section {
  padding: 16px;
}
.unlock-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
}
.unlock-btn {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #1989fa, #07c160);
  color: white;
  font-size: 28px;
  font-weight: bold;
  box-shadow: 0 8px 24px rgba(25, 137, 250, 0.4);
  cursor: pointer;
  transition: transform 0.2s;
}
.unlock-btn:active:not(.disabled) {
  transform: scale(0.95);
}
.unlock-btn.disabled {
  background: #c8c9cc;
  box-shadow: none;
  cursor: not-allowed;
}
.unlock-hint {
  margin-top: 16px;
  font-size: 12px;
  color: #969799;
}
</style>

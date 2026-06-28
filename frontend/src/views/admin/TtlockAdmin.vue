<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';
import { showLoadingToast, closeToast, showSuccessToast, showToast, showConfirmDialog, showDialog } from 'vant';

interface TtlockConfig {
  clientId: string;
  clientSecret: string;
  hasClientSecret: boolean;
  username: string;
  password: string;
  hasPassword: boolean;
  apiBase: string;
  lockId: number;
  gatewayId: number;
  mockUnlock: boolean;
}

interface TtlockGateway {
  gatewayId: number;
  gatewayMac?: string;
  lockNum?: number;
  isOnline?: number;
}

interface TtlockLock {
  lockId: number;
  lockAlias?: string;
  lockName?: string;
  lockMac?: string;
  electricQuantity?: number;
  hasGateway?: number;
}

interface TokenStatus {
  hasToken: boolean;
  valid?: boolean;
  expiresAt?: string;
  accessTokenPreview?: string;
}

const clientId = ref('');
const clientSecret = ref('');
const username = ref('');
const password = ref('');
const apiBase = ref('https://cnapi.ttlock.com');
const lockId = ref('');
const gatewayId = ref('');
const mockUnlock = ref(true);
const tokenStatus = ref<TokenStatus>({ hasToken: false });
const gateways = ref<TtlockGateway[]>([]);
const gatewayLocks = ref<TtlockLock[]>([]);
const accountLocks = ref<TtlockLock[]>([]);
const loading = ref(false);

async function loadConfig() {
  const res = await api.get<ApiResponse<TtlockConfig>>('/ttlock/config');
  const c = res.data;
  clientId.value = c.clientId || '';
  clientSecret.value = c.clientSecret || '';
  username.value = c.username || '';
  password.value = c.password || '';
  apiBase.value = c.apiBase || 'https://cnapi.ttlock.com';
  lockId.value = c.lockId ? String(c.lockId) : '';
  gatewayId.value = c.gatewayId ? String(c.gatewayId) : '';
  mockUnlock.value = c.mockUnlock;
}

async function loadTokenStatus() {
  const res = await api.get<ApiResponse<TokenStatus>>('/ttlock/token-status');
  tokenStatus.value = res.data;
}

onMounted(async () => {
  await Promise.all([loadConfig(), loadTokenStatus()]);
});

async function saveConfig() {
  loading.value = true;
  showLoadingToast({ message: '保存中...', forbidClick: true });
  try {
    await api.put('/ttlock/config', {
      clientId: clientId.value,
      clientSecret: clientSecret.value,
      username: username.value,
      password: password.value,
      apiBase: apiBase.value,
      mockUnlock: mockUnlock.value,
    });
    await loadConfig();
    await loadTokenStatus();
    showSuccessToast('配置已保存');
  } finally {
    loading.value = false;
    closeToast();
  }
}

async function testAuth() {
  loading.value = true;
  showLoadingToast({ message: '获取 Token...', forbidClick: true });
  try {
    const res = await api.post<
      ApiResponse<{
        success: boolean;
        accessTokenPreview?: string;
        expiresAt?: string;
        expiresIn?: number;
        uid?: number;
        message?: string;
      }>
    >('/ttlock/test-auth');
    await loadTokenStatus();
    if (res.data.success) {
      showSuccessToast(`Token 获取成功：${res.data.accessTokenPreview}`);
    } else {
      showToast(res.data.message || '获取 Token 失败');
    }
  } finally {
    loading.value = false;
    closeToast();
  }
}

async function refreshAll() {
  loading.value = true;
  showLoadingToast({ message: '刷新设备信息...', forbidClick: true });
  try {
    await loadTokenStatus();
    const [gwRes, lockRes] = await Promise.all([
      api.get<ApiResponse<TtlockGateway[]>>('/ttlock/gateways'),
      api.get<ApiResponse<TtlockLock[]>>('/ttlock/locks'),
    ]);
    if (!gwRes.success) {
      showToast(gwRes.message || '查询网关失败');
      return;
    }
    if (!lockRes.success) {
      showToast(lockRes.message || '查询锁列表失败');
      return;
    }
    gateways.value = gwRes.data || [];
    accountLocks.value = lockRes.data || [];
    if (gatewayId.value) {
      const gwLockRes = await api.get<ApiResponse<TtlockLock[]>>('/ttlock/gateway-locks', {
        params: { gatewayId: gatewayId.value },
      });
      if (!gwLockRes.success) {
        showToast(gwLockRes.message || '查询网关下锁失败');
        return;
      }
      gatewayLocks.value = gwLockRes.data || [];
    }
    showSuccessToast('信息已刷新');
  } catch {
    showToast('刷新失败，请检查凭证配置');
  } finally {
    loading.value = false;
    closeToast();
  }
}

async function fetchGateways() {
  loading.value = true;
  showLoadingToast({ message: '查询网关...', forbidClick: true });
  try {
    const res = await api.get<ApiResponse<TtlockGateway[]>>('/ttlock/gateways');
    gateways.value = res.data || [];
    if (!res.success) {
      showToast(res.message || '查询网关失败');
      return;
    }
    if (gateways.value.length === 0) {
      showToast('未找到网关，请确认 App 中已添加 G3 网关');
    } else {
      showSuccessToast(`找到 ${gateways.value.length} 个网关`);
    }
  } finally {
    loading.value = false;
    closeToast();
  }
}

async function fetchGatewayLocks() {
  if (!gatewayId.value) {
    showToast('请先填写或选择网关 ID');
    return;
  }
  loading.value = true;
  showLoadingToast({ message: '查询网关下锁...', forbidClick: true });
  try {
    const res = await api.get<ApiResponse<TtlockLock[]>>('/ttlock/gateway-locks', {
      params: { gatewayId: gatewayId.value },
    });
    gatewayLocks.value = res.data || [];
    if (!res.success) {
      showToast(res.message || '查询失败');
      return;
    }
    if (gatewayLocks.value.length === 0) {
      showToast('该网关下暂无锁');
    } else {
      showSuccessToast(`找到 ${gatewayLocks.value.length} 把锁`);
    }
  } finally {
    loading.value = false;
    closeToast();
  }
}

async function fetchAccountLocks() {
  loading.value = true;
  showLoadingToast({ message: '查询账号锁列表...', forbidClick: true });
  try {
    const res = await api.get<ApiResponse<TtlockLock[]>>('/ttlock/locks');
    accountLocks.value = res.data || [];
    if (!res.success) {
      showToast(res.message || '查询失败');
      return;
    }
    if (accountLocks.value.length === 0) {
      showToast('账号下暂无锁');
    } else {
      showSuccessToast(`找到 ${accountLocks.value.length} 把锁`);
    }
  } finally {
    loading.value = false;
    closeToast();
  }
}

function selectGateway(g: TtlockGateway) {
  showToast(`请在服务器 .env 中设置 TTLOCK_GATEWAY_ID=${g.gatewayId} 后重启后端`);
}

function selectLock(lock: TtlockLock) {
  showToast(`请在服务器 .env 中设置 TTLOCK_LOCK_ID=${lock.lockId} 后重启后端`);
}

function formatOnline(v?: number) {
  return v === 1 ? '在线' : '离线';
}

async function adminUnlock() {
  try {
    await showConfirmDialog({
      title: '强制开锁',
      message: '确认立即强制远程开门？',
    });
  } catch {
    return;
  }

  loading.value = true;
  showLoadingToast({ message: '开门中...', forbidClick: true });
  try {
    const res = await api.post<ApiResponse<{ message: string }>>('/access/admin/unlock');
    showSuccessToast(res.message || res.data?.message || '开门成功');
  } finally {
    loading.value = false;
    closeToast();
  }
}

async function showTempPasscode() {
  loading.value = true;
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
    loading.value = false;
    closeToast();
  }
}
</script>

<template>
  <div>
    <h3>通通锁管理</h3>
    <p class="hint">开放平台凭证可在下方保存；网关 ID 与锁 ID 请在服务器 .env 中配置（TTLOCK_GATEWAY_ID / TTLOCK_LOCK_ID）</p>

    <van-cell-group inset title="开放平台凭证">
      <van-field v-model="clientId" label="Client ID" placeholder="开放平台应用 ID" />
      <van-field
        v-model="clientSecret"
        label="Client Secret"
        type="password"
        placeholder="开放平台应用密钥"
      />
      <van-field v-model="username" label="通通锁账号" placeholder="App 登录手机号" />
      <van-field
        v-model="password"
        label="通通锁密码"
        type="password"
        placeholder="App 登录密码"
      />
      <van-field v-model="apiBase" label="API 地址" placeholder="https://cnapi.ttlock.com" />
    </van-cell-group>

    <van-cell-group inset title="设备绑定（.env 配置）">
      <van-field
        v-model="gatewayId"
        label="网关 ID"
        placeholder="TTLOCK_GATEWAY_ID"
        type="digit"
        readonly
      />
      <van-field
        v-model="lockId"
        label="锁 ID"
        placeholder="TTLOCK_LOCK_ID"
        type="digit"
        readonly
      />
      <van-cell title="模拟开门">
        <template #right-icon>
          <van-switch v-model="mockUnlock" size="20" />
        </template>
      </van-cell>
    </van-cell-group>

    <div class="btn-group">
      <van-button round block type="primary" :loading="loading" @click="saveConfig">
        保存配置
      </van-button>
      <van-button round block type="danger" plain :loading="loading" @click="adminUnlock">
        强制开锁
      </van-button>
      <van-button round block plain type="primary" :loading="loading" @click="showTempPasscode">
        查看临时密码
      </van-button>
    </div>

    <van-cell-group inset title="连接状态">
      <van-cell title="Access Token">
        <template #label>
          <span v-if="tokenStatus.hasToken">
            {{ tokenStatus.valid ? '有效' : '已过期' }}
            <template v-if="tokenStatus.accessTokenPreview">
              · {{ tokenStatus.accessTokenPreview }}
            </template>
            <template v-if="tokenStatus.expiresAt">
              · 到期 {{ new Date(tokenStatus.expiresAt).toLocaleString() }}
            </template>
          </span>
          <span v-else>尚未获取，请先保存凭证后测试</span>
        </template>
      </van-cell>
    </van-cell-group>

    <div class="btn-group">
      <van-button round block plain type="primary" :loading="loading" @click="testAuth">
        获取 Token
      </van-button>
      <van-button round block plain :loading="loading" @click="refreshAll">
        一键刷新全部信息
      </van-button>
    </div>

    <van-cell-group inset title="设备信息">
      <van-cell title="网关列表">
        <template #value>
          <van-button size="mini" plain type="primary" :loading="loading" @click="fetchGateways">
            查询
          </van-button>
        </template>
      </van-cell>
      <van-cell
        v-for="g in gateways"
        :key="g.gatewayId"
        :title="`网关 ${g.gatewayId}`"
        :label="`${g.gatewayMac || ''} · ${formatOnline(g.isOnline)} · ${g.lockNum ?? 0} 把锁`"
        is-link
        @click="selectGateway(g)"
      />
      <van-cell v-if="!gateways.length" title="暂无数据" label="点击上方「查询」获取网关列表" />

      <van-cell title="网关下锁">
        <template #value>
          <van-button size="mini" plain type="primary" :loading="loading" @click="fetchGatewayLocks">
            查询
          </van-button>
        </template>
      </van-cell>
      <van-cell
        v-for="lock in gatewayLocks"
        :key="'gw-' + lock.lockId"
        :title="lock.lockAlias || lock.lockName || `锁 ${lock.lockId}`"
        :label="`ID: ${lock.lockId} · 电量 ${lock.electricQuantity ?? '-'}%`"
        is-link
        @click="selectLock(lock)"
      />
      <van-cell v-if="!gatewayLocks.length" title="暂无数据" label="选择网关 ID 后查询" />

      <van-cell title="账号下所有锁">
        <template #value>
          <van-button size="mini" plain type="primary" :loading="loading" @click="fetchAccountLocks">
            查询
          </van-button>
        </template>
      </van-cell>
      <van-cell
        v-for="lock in accountLocks"
        :key="'acc-' + lock.lockId"
        :title="lock.lockAlias || lock.lockName || `锁 ${lock.lockId}`"
        :label="`ID: ${lock.lockId} · 网关: ${lock.hasGateway === 1 ? '已连接' : '未连接'}`"
        is-link
        @click="selectLock(lock)"
      />
      <van-cell v-if="!accountLocks.length" title="暂无数据" label="点击上方「查询」获取锁列表" />
    </van-cell-group>

    <p class="hint">点击列表项可查看对应 ID，复制到 .env 后重启后端生效</p>
  </div>
</template>

<style scoped>
h3 { margin-bottom: 8px; }
.hint { font-size: 12px; color: #969799; padding: 0 4px; margin: 8px 0 16px; }
.btn-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
}
</style>

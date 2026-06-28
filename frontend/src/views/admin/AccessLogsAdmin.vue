<script setup lang="ts">
import { ref } from 'vue';
import api, { ApiResponse } from '@/api';

interface AccessLog {
  id: string;
  method: string;
  result: string;
  errMsg?: string;
  redemptionCode?: string;
  createdAt: string;
  user: { nickname?: string; openid: string };
}

const logs = ref<AccessLog[]>([]);
const codeQuery = ref('');
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    const digits = codeQuery.value.replace(/\D/g, '');
    if (digits) params.code = digits;
    const res = await api.get<ApiResponse<{ items: AccessLog[] }>>('/access/admin/logs', { params });
    logs.value = res.data.items;
  } finally {
    loading.value = false;
  }
}

function formatUser(log: AccessLog) {
  if (log.redemptionCode) return log.redemptionCode;
  return log.user?.nickname || log.user?.openid?.slice(0, 12) || '-';
}

function formatLabel(log: AccessLog) {
  const time = new Date(log.createdAt).toLocaleString('zh-CN');
  const parts = [time];
  if (log.redemptionCode && log.user?.nickname) {
    parts.push(log.user.nickname);
  }
  if (log.errMsg) parts.push(log.errMsg);
  return parts.join(' · ');
}

load();
</script>

<template>
  <div>
    <h3>开门记录</h3>
    <van-search
      v-model="codeQuery"
      placeholder="按兑换码查询"
      maxlength="11"
      show-action
      @search="load"
    >
      <template #action>
        <div @click="load">搜索</div>
      </template>
    </van-search>

    <van-cell-group inset>
      <van-cell
        v-for="log in logs"
        :key="log.id"
        :title="`${log.method === 'remote' ? '远程' : '密码'} · ${log.result === 'success' ? '成功' : '失败'}`"
        :label="formatLabel(log)"
        :value="formatUser(log)"
      />
      <van-empty v-if="!loading && logs.length === 0" description="暂无记录" />
    </van-cell-group>
  </div>
</template>

<style scoped>
h3 { margin-bottom: 16px; }
</style>

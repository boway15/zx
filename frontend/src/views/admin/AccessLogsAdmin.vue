<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';

interface AccessLog {
  id: string;
  method: string;
  result: string;
  errMsg?: string;
  createdAt: string;
  user: { nickname?: string; openid: string };
}

const logs = ref<AccessLog[]>([]);

onMounted(async () => {
  const res = await api.get<ApiResponse<{ items: AccessLog[] }>>('/access/admin/logs');
  logs.value = res.data.items;
});
</script>

<template>
  <div>
    <h3>开门记录</h3>
    <van-cell-group inset>
      <van-cell
        v-for="log in logs"
        :key="log.id"
        :title="`${log.method === 'remote' ? '远程' : '密码'} · ${log.result === 'success' ? '成功' : '失败'}`"
        :label="log.errMsg || new Date(log.createdAt).toLocaleString('zh-CN')"
        :value="log.user?.nickname || log.user?.openid?.slice(0, 8)"
      />
      <van-empty v-if="logs.length === 0" description="暂无记录" />
    </van-cell-group>
  </div>
</template>

<style scoped>
h3 { margin-bottom: 16px; }
</style>

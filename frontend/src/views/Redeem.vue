<script setup lang="ts">
/**
 * 遗留页面：当前用户入口为 UserApp.vue（/）。
 * 保留此文件仅作参考，请勿在新路由中挂载。
 */
import { ref } from 'vue';
import { showDialog } from 'vant';

const code = ref('');

async function redeem() {
  await showDialog({
    title: '页面已停用',
    message: '请返回首页 http://localhost:9080 输入 11 位兑换码进入。',
  });
}
</script>

<template>
  <div class="redeem-page">
    <van-nav-bar title="兑换会员卡" fixed placeholder />
    <van-notice-bar
      wrapable
      :scrollable="false"
      text="此页面已停用，请返回首页输入 11 位兑换码。"
    />
    <van-form @submit="redeem">
      <van-cell-group inset title="输入兑换码">
        <van-field
          v-model="code"
          center
          clearable
          placeholder="请输入11位数字兑换码"
          maxlength="11"
          :formatter="(v: string) => v.replace(/\D/g, '')"
        />
      </van-cell-group>
    </van-form>
  </div>
</template>

<style scoped>
.redeem-page {
  min-height: 100vh;
  padding-bottom: 60px;
}
</style>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';
import { showLoadingToast, closeToast, showSuccessToast } from 'vant';

const storeName = ref('');
const start = ref('');
const end = ref('');
const wechatId = ref('');
const wechatQrcodeUrl = ref('');
const meituanUrl = ref('');
const qrcodeUploading = ref(false);

onMounted(async () => {
  const res = await api.get<ApiResponse<Record<string, string>>>('/settings/admin');
  storeName.value = res.data.store_name || '';
  start.value = res.data.business_hours_start || '08:00';
  end.value = res.data.business_hours_end || '22:00';
  wechatId.value = res.data.admin_wechat_id || '';
  wechatQrcodeUrl.value = res.data.admin_wechat_qrcode_url || '';
  meituanUrl.value = res.data.meituan_url || '';
});

async function save() {
  await api.put('/settings/admin', {
    settings: {
      store_name: storeName.value,
      business_hours_start: start.value,
      business_hours_end: end.value,
      admin_wechat_id: wechatId.value,
      admin_wechat_qrcode_url: wechatQrcodeUrl.value,
      meituan_url: meituanUrl.value,
    },
  });
  showSuccessToast('保存成功');
}

async function uploadQrcode(file: { file: File | undefined }) {
  if (!file.file) return;
  qrcodeUploading.value = true;
  showLoadingToast({ message: '上传中...', forbidClick: true });
  try {
    const formData = new FormData();
    formData.append('file', file.file);
    const res = await api.post<ApiResponse<{ url: string }>>('/settings/admin/wechat-qrcode', formData);
    wechatQrcodeUrl.value = res.data.url;
    showSuccessToast('二维码已更新');
  } finally {
    qrcodeUploading.value = false;
    closeToast();
  }
}
</script>

<template>
  <div>
    <h3>系统设置</h3>
    <van-form @submit="save">
      <van-cell-group inset>
        <van-field v-model="storeName" label="门店名称" />
        <van-field v-model="start" label="营业开始" placeholder="08:00" />
        <van-field v-model="end" label="营业结束" placeholder="22:00" />
        <van-field v-model="wechatId" label="管理员微信" placeholder="微信号或手机号" />
        <van-cell title="微信二维码" label="上传图片后自动更新，替换上传即可">
          <template #value>
            <div class="qrcode-upload">
              <img
                v-if="wechatQrcodeUrl"
                :src="wechatQrcodeUrl"
                alt="微信二维码预览"
                class="qrcode-preview"
              />
              <van-uploader
                :max-count="1"
                accept="image/*"
                :disabled="qrcodeUploading"
                :after-read="uploadQrcode"
              >
                <van-button size="small" type="primary" plain :loading="qrcodeUploading">
                  {{ wechatQrcodeUrl ? '更换图片' : '上传图片' }}
                </van-button>
              </van-uploader>
            </div>
          </template>
        </van-cell>
        <van-field v-model="meituanUrl" label="美团链接" placeholder="美团店铺或商品页链接" />
      </van-cell-group>
      <div style="padding: 16px">
        <van-button round block type="primary" native-type="submit">保存</van-button>
      </div>
    </van-form>
    <van-divider>通通锁配置</van-divider>
    <p class="hint">锁ID、网关ID、通通锁凭证请在服务器 .env 文件中配置</p>
    <p class="hint">用户端首页会展示管理员微信二维码、微信号与美团购买入口</p>
  </div>
</template>

<style scoped>
h3 { margin-bottom: 16px; }
.hint { font-size: 12px; color: #969799; padding: 0 16px; }
.qrcode-upload {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.qrcode-preview {
  width: 88px;
  height: 88px;
  object-fit: contain;
  border: 1px solid var(--tt-border);
  border-radius: 6px;
  background: #fff;
}
</style>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSessionStore } from '@/stores/session';
import api, { ApiResponse } from '@/api';
import { showLoadingToast, closeToast, showDialog, showSuccessToast, showConfirmDialog } from 'vant';
import SeatBooking from '@/components/SeatBooking.vue';

const session = useSessionStore();
const codeInput = ref('');
const loading = ref(false);
const activeTab = ref(0);
const adminWechatId = ref('');
const adminWechatQrcodeUrl = ref('');
const meituanUrl = ref('');
const unlocking = ref(false);
const businessHours = ref({ start: '08:00', end: '22:00', isOpen: true });
const helpTab = ref<'entry' | 'wechat' | 'meituan' | 'douyin'>('entry');

const helpTabs = [
  { key: 'entry' as const, label: '进门' },
  { key: 'wechat' as const, label: '微信' },
  { key: 'meituan' as const, label: '美团' },
  { key: 'douyin' as const, label: '抖音' },
];

function formatBusinessTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  const period = h < 12 ? '早' : '晚';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m ? `${period}${hour}:${String(m).padStart(2, '0')}` : `${period}${hour}点`;
}

function formatBusinessHoursRange() {
  const { start, end } = businessHours.value;
  return `${formatBusinessTime(start)} - ${formatBusinessTime(end)}`;
}

async function loadSettings() {
  const res = await api.get<ApiResponse<{
    businessHoursStart: string;
    businessHoursEnd: string;
    adminWechatId: string;
    adminWechatQrcodeUrl: string;
    meituanUrl: string;
  }>>('/settings/public');
  adminWechatId.value = res.data.adminWechatId || '';
  adminWechatQrcodeUrl.value = res.data.adminWechatQrcodeUrl || '';
  meituanUrl.value = res.data.meituanUrl || '';
  businessHours.value = {
    start: res.data.businessHoursStart || '08:00',
    end: res.data.businessHoursEnd || '22:00',
    isOpen: isWithinBusinessHours(res.data.businessHoursStart, res.data.businessHoursEnd),
  };
}

function isWithinBusinessHours(start: string, end: string) {
  const now = new Date();
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const current = now.getHours() * 60 + now.getMinutes();
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  return current >= startMin && current <= endMin;
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('zh-CN');
}

interface CodePreview {
  isFirstActivation: boolean;
  code: string;
  productName: string;
  productDescription?: string;
  redeemValidUntil?: string;
  membershipStartAt?: string;
  membershipEndAt?: string;
}

function buildActivationConfirmMessage(preview: CodePreview) {
  const lines = [
    `卡类型：${preview.productName}`,
    `生效时间：${formatDateTime(preview.membershipStartAt!)}`,
    `有效期至：${formatDateTime(preview.membershipEndAt!)}`,
  ];
  if (preview.redeemValidUntil) {
    lines.push(`兑换码激活期限：${formatDateTime(preview.redeemValidUntil)}`);
  }
  if (preview.productDescription) {
    lines.push(`说明：${preview.productDescription}`);
  }
  lines.push('', '激活后再次输入本兑换码即可直接进入，无需重复确认。');
  return lines.join('\n');
}

async function submitCode() {
  const digits = codeInput.value.replace(/\D/g, '');
  if (digits.length !== 11) {
    showDialog({ title: '提示', message: '请输入11位数字兑换码' });
    return;
  }
  loading.value = true;
  showLoadingToast({ message: '验证中...', forbidClick: true });
  try {
    const previewRes = await api.post<ApiResponse<CodePreview>>('/redemption/preview', { code: digits });
    const preview = previewRes.data;

    if (preview.isFirstActivation) {
      closeToast();
      try {
        await showConfirmDialog({
          title: '确认激活会员卡',
          message: buildActivationConfirmMessage(preview),
          confirmButtonText: '确认激活',
          cancelButtonText: '取消',
        });
      } catch {
        return;
      }
      showLoadingToast({ message: '激活中...', forbidClick: true });
    }

    await session.accessByCode(digits);
    showSuccessToast(preview.isFirstActivation ? '激活成功' : '验证成功');
    codeInput.value = '';
    await refreshStatus();
  } finally {
    loading.value = false;
    closeToast();
  }
}

function formatReservationLabel(reservation: NonNullable<typeof session.info>['reservation']) {
  if (!reservation) return '';
  if (reservation.multiDay && reservation.dateFrom && reservation.dateTo && reservation.dayCount) {
    return `${reservation.seatLabel} · 固定 ${reservation.dayCount} 天`;
  }
  return reservation.seatLabel;
}

function formatReservationSub(reservation: NonNullable<typeof session.info>['reservation']) {
  if (!reservation?.multiDay || !reservation.dateFrom || !reservation.dateTo) return '';
  return `${reservation.dateFrom} 至 ${reservation.dateTo}`;
}

async function refreshStatus() {
  if (!session.isActive) return;
  const res = await api.get<ApiResponse<{
    businessHours: { start: string; end: string; isOpen: boolean };
    passcode: string | null;
    reservation: {
      seatLabel: string;
      reserveDate: string;
      multiDay?: boolean;
      dateFrom?: string | null;
      dateTo?: string | null;
      dayCount?: number;
    } | null;
  }>>('/access/status');
  businessHours.value = res.data.businessHours;
  if (session.info) {
    if (res.data.passcode) {
      session.info.passcode = res.data.passcode;
    }
    session.updateReservation(res.data.reservation);
  }
}

async function unlock() {
  if (!session.isActive) return;
  if (!businessHours.value.isOpen) {
    showDialog({
      title: '提示',
      message: `当前非营业时间（${formatBusinessHoursRange()}）`,
    });
    return;
  }
  if (!session.info?.reservation) {
    showDialog({
      title: '提示',
      message: '您今日尚未预约座位，请先前往「预约座位」预约后再开门',
      confirmButtonText: '去预约',
    }).then(() => {
      activeTab.value = 1;
    });
    return;
  }
  unlocking.value = true;
  showLoadingToast({ message: '开门中...', forbidClick: true });
  try {
    const res = await api.post<ApiResponse<{ method: string; passcode?: string; reservation?: { seatLabel: string } }>>('/access/unlock');
    closeToast();
    if (res.data.method === 'remote') {
      showSuccessToast(`开门成功，请前往 ${res.data.reservation?.seatLabel || session.info.reservation.seatLabel}`);
    } else if (res.data.passcode) {
      showDialog({
        title: '请使用备用密码',
        message: `远程开门失败，请在门锁键盘输入：\n\n${res.data.passcode}\n\n您的座位：${session.info.reservation.seatLabel}`,
      });
    }
  } finally {
    unlocking.value = false;
    closeToast();
  }
}

function showPasscode() {
  if (!session.info?.passcode) return;
  showDialog({ title: '门锁备用密码', message: session.info.passcode });
}

function exitSession() {
  session.clear();
  activeTab.value = 0;
}

async function copyText(text: string, emptyMessage: string) {
  if (!text) {
    showDialog({ title: '提示', message: emptyMessage });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showSuccessToast('已复制');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showSuccessToast('已复制');
    } catch {
      showDialog({ title: '复制失败', message: text });
    } finally {
      document.body.removeChild(ta);
    }
  }
}

function copyWechatId() {
  copyText(adminWechatId.value, '管理员微信号尚未配置，请联系门店');
}

function openMeituan() {
  if (!meituanUrl.value) {
    showDialog({
      title: '提示',
      message: '美团购买链接尚未配置，请使用微信转账方式购卡，或联系管理员',
    });
    return;
  }
  window.open(meituanUrl.value, '_blank', 'noopener,noreferrer');
}

onMounted(() => {
  document.title = '朴素自习室';
  loadSettings();
  if (session.isActive) refreshStatus();
});
</script>

<template>
  <div class="user-app">
    <div v-if="!session.isActive" class="home-page">
      <header class="home-brand">
        <p class="brand-title">朴素自习·办公·考研·考公</p>
        <p class="brand-desc">面向务实学习、工作者的安静自习空间</p>
      </header>

      <section class="home-section redeem-section">
        <h2 class="section-title">输入兑换码</h2>
        <van-form @submit="submitCode">
          <van-field
            v-model="codeInput"
            type="tel"
            center
            clearable
            placeholder="11 位数字兑换码"
            maxlength="11"
            class="redeem-field"
            :formatter="(v: string) => v.replace(/\D/g, '')"
          />
          <van-button
            round
            block
            type="primary"
            native-type="submit"
            :loading="loading"
            class="redeem-submit"
          >
            进入自习室
          </van-button>
        </van-form>
        <p class="redeem-tip">激活后预约座位，营业时间内开门</p>
      </section>

      <section class="home-section contact-section">
        <h2 class="section-title">联系管理员</h2>
        <p class="section-lead">联系管理员购卡或者核销</p>
        <div class="contact-body">
          <div class="qrcode-wrap">
            <img
              v-if="adminWechatQrcodeUrl"
              :src="adminWechatQrcodeUrl"
              alt="管理员微信二维码"
              class="qrcode-img"
            />
            <div v-else class="qrcode-placeholder">
              <van-icon name="qr" class="qrcode-icon" />
              <span>待配置</span>
            </div>
          </div>
          <div class="contact-info">
            <p class="qrcode-tip">长按识别二维码<br />添加管理员微信</p>
            <div class="wechat-row">
              <span class="wechat-row-label">微信号</span>
              <span class="wechat-row-value">{{ adminWechatId || '待配置' }}</span>
              <button type="button" class="wechat-copy-btn" @click="copyWechatId">复制</button>
            </div>
          </div>
        </div>
      </section>

      <section class="home-section help-section">
        <h2 class="section-title">使用帮助</h2>
        <div class="help-tabs">
          <button
            v-for="tab in helpTabs"
            :key="tab.key"
            type="button"
            class="help-tab"
            :class="{ active: helpTab === tab.key }"
            @click="helpTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
        <div class="help-panel">
          <ol v-if="helpTab === 'entry'" class="help-steps">
            <li>输入兑换码激活会员卡</li>
            <li>前往「预约座位」选择今日座位</li>
            <li>营业时间内点击「开门」进入</li>
          </ol>
          <ol v-else-if="helpTab === 'wechat'" class="help-steps">
            <li>复制微信号，添加管理员好友</li>
            <li>微信转账购卡，告知卡类型</li>
            <li>收到 11 位兑换码后返回首页输入</li>
          </ol>
          <ol v-else-if="helpTab === 'meituan'" class="help-steps">
            <li>在美团平台购买自习卡</li>
            <li>添加管理员微信，发送订单或券码</li>
            <li>管理员核销后发送兑换码，返回首页输入</li>
            <li v-if="meituanUrl" class="help-action">
              <van-button round plain type="primary" size="small" @click="openMeituan">
                前往美团购买
              </van-button>
            </li>
          </ol>
          <ol v-else class="help-steps">
            <li>在抖音平台购买自习卡</li>
            <li>添加管理员微信，发送订单或券码</li>
            <li>管理员核销后发送兑换码，返回首页输入</li>
          </ol>
        </div>
        <p class="help-hours">
          营业时间 {{ formatBusinessHoursRange() }}（{{ businessHours.isOpen ? '营业中' : '已打烊' }}）
        </p>
      </section>

      <section class="home-section letter-section">
        <h2 class="section-title">给朴素朋友的一封信</h2>
        <div class="letter-body">
          <p class="letter-greeting">
            　朋友，朴素自习室真的很朴素，白墙、老旧桌椅、浅灯光，没什么值得拍照发朋友圈的。但我们尽力让它干净、安静——让每一个进来的人，能随时坐下，不被打扰。
          </p>
          <p>
            朴素不是简陋，是一种选择。我们主动舍去花哨的装修、多余的服务、不必要的热闹，把空间腾出来，还给你。因为真正重要的，从来不是环境多好看，而是你坐在那里，面前摊开的书、写到一半的笔记、理不清的思路——这些才值得被认真对待。
          </p>
          <p>
            费用只收维持运转的最低必要开支。不捆绑，不套路，不劝办卡。我们想让你觉得：来这里，是一件不必犹豫的小事。
          </p>
          <p>
            条件确实简陋，有些地方还在慢慢补。做得不够好的，先说声抱歉。但我们真心想把这件事做好。
          </p>
          <p>
            无论你是考研、考公，还是创业、写作、理思路，这里都欢迎。给不了你精致的氛围，只能给你一张干净的桌子，和一段不被打扰的时间。
          </p>
          <p>
            朴素之道，是收敛杂念，把注意力种在最该开花的地方。愿你坐在这里时，世界变小，目标变清晰。备考的，如愿上岸；创业的，渐入佳境；做事的，落笔有力。也愿你每一次推门离开，都比来时更稳一些、更亮一些。
          </p>
          <p class="letter-sign">朴素自习室，敬上。</p>
        </div>
        <span class="postmark" aria-hidden="true">朴素自习室</span>
      </section>
    </div>

    <template v-else>
      <van-notice-bar
        wrapable
        :scrollable="false"
        :text="`兑换码 ${session.info!.code} · ${session.formatValidity()}`"
      />

      <van-tabs v-model:active="activeTab" sticky offset-top="0" class="main-tabs">
        <van-tab title="使用">
          <div class="card-section">
            <van-cell-group inset>
              <van-cell title="卡类型" :value="session.info!.membership.productName" />
              <van-cell title="生效时间" :value="new Date(session.info!.membership.startAt).toLocaleString('zh-CN')" />
              <van-cell title="有效期至" :value="new Date(session.info!.membership.endAt).toLocaleString('zh-CN')" />
              <van-cell
                title="营业时间"
                :value="`${formatBusinessHoursRange()}${businessHours.isOpen ? '（营业中）' : '（已打烊）'}`"
              />
              <van-cell
                v-if="session.info!.reservation"
                title="固定座位"
                :value="formatReservationLabel(session.info!.reservation)"
                :label="formatReservationSub(session.info!.reservation) || undefined"
              />
              <van-cell
                v-else
                title="今日座位"
                value="未预约"
                value-class="unreserved"
              />
              <van-cell
                v-if="session.info!.passcode"
                title="门锁密码"
                is-link
                @click="showPasscode"
              />
            </van-cell-group>
          </div>

          <div class="unlock-section">
            <div v-if="session.info!.reservation" class="reservation-banner">
              <p class="reservation-label">
                {{ session.info!.reservation.multiDay ? '固定座位' : '今日预约座位' }}
              </p>
              <p class="reservation-seat">{{ session.info!.reservation.seatLabel }}</p>
              <p
                v-if="session.info!.reservation.multiDay && session.info!.reservation.dateFrom"
                class="reservation-range"
              >
                {{ session.info!.reservation.dateFrom }} 至 {{ session.info!.reservation.dateTo }}
              </p>
            </div>
            <van-notice-bar
              v-else
              wrapable
              :scrollable="false"
              text="请先预约座位后再开门"
              color="#ed6a0c"
              background="#fffbe8"
              left-icon="warning-o"
            />
            <button class="unlock-btn" :disabled="unlocking" @click="unlock">
              {{ unlocking ? '开门中...' : '开门' }}
            </button>
            <p class="hint">营业时间 {{ formatBusinessHoursRange() }} · 远程开门，失败时将提示备用密码</p>
          </div>

          <div class="btn-wrap">
            <van-button block round plain hairline type="default" @click="exitSession">
              切换兑换码
            </van-button>
          </div>
        </van-tab>

        <van-tab title="预约座位">
          <SeatBooking />
        </van-tab>
      </van-tabs>
    </template>
  </div>
</template>

<style scoped>
.user-app {
  min-height: 100vh;
  padding-bottom: 24px;
  background: var(--tt-bg);
}

.code-section {
  padding: 12px 0 16px;
}

.home-page {
  padding: 0 16px 32px;
  max-width: 520px;
  margin: 0 auto;
}

.home-brand {
  padding: 28px 4px 20px;
  text-align: center;
}

.brand-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 400;
  color: var(--tt-text);
  line-height: 1.6;
}

.brand-desc {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  color: var(--tt-text-secondary);
  line-height: 1.6;
}

.home-section {
  margin-top: 12px;
  padding: 16px;
  background: var(--tt-card);
  border: 1px solid var(--tt-border);
  border-radius: 12px;
}

.redeem-section {
  margin-top: 12px;
}

.section-lead {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--tt-text-secondary);
  line-height: 1.5;
}

.redeem-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--tt-text-secondary);
  text-align: center;
}

.section-title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
  color: var(--tt-text);
}

.redeem-section :deep(.redeem-field) {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--tt-bg);
  border-radius: 10px;
}

.redeem-section :deep(.redeem-field .van-field__control) {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 2px;
  text-align: center;
}

.redeem-section :deep(.redeem-field .van-field__control::placeholder) {
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0;
}

.redeem-submit {
  height: 44px;
  font-size: 16px;
  font-weight: 600;
}

.qrcode-wrap {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.contact-body {
  display: flex;
  align-items: center;
  gap: 14px;
}

.contact-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}

.qrcode-img {
  width: 100px;
  height: 100px;
  object-fit: contain;
  border-radius: 6px;
  background: #fff;
  border: 1px solid var(--tt-border);
}

.qrcode-placeholder {
  width: 100px;
  height: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed var(--tt-border);
  border-radius: 6px;
  background: var(--tt-bg);
  font-size: 11px;
  color: var(--tt-text-secondary);
}

.qrcode-icon {
  font-size: 24px;
  color: var(--tt-text-secondary);
}

.qrcode-tip {
  margin: 0;
  font-size: 12px;
  color: var(--tt-text-secondary);
  line-height: 1.5;
}

.wechat-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--tt-border);
  border-radius: 8px;
  background: var(--tt-bg);
}

.wechat-row-label {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--tt-text-secondary);
}

.wechat-row-value {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--tt-text);
  word-break: break-all;
}

.wechat-copy-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid rgba(248, 89, 89, 0.35);
  border-radius: 14px;
  background: rgba(248, 89, 89, 0.08);
  font-size: 11px;
  font-weight: 600;
  color: var(--tt-red);
  cursor: pointer;
}

.wechat-copy-btn:active {
  opacity: 0.75;
}

.help-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.help-tab {
  flex: 1;
  padding: 8px 0;
  border: 1px solid var(--tt-border);
  border-radius: 8px;
  background: var(--tt-bg);
  font-size: 13px;
  color: var(--tt-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.help-tab.active {
  color: var(--tt-red);
  border-color: rgba(248, 89, 89, 0.4);
  background: rgba(248, 89, 89, 0.06);
  font-weight: 600;
}

.help-panel {
  min-height: 88px;
}

.help-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  counter-reset: help;
}

.help-steps li {
  position: relative;
  padding-left: 22px;
  font-size: 13px;
  color: var(--tt-text);
  line-height: 1.5;
  counter-increment: help;
}

.help-steps li::before {
  content: counter(help);
  position: absolute;
  left: 0;
  top: 1px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--tt-bg);
  border: 1px solid var(--tt-border);
  font-size: 11px;
  font-weight: 600;
  color: var(--tt-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.help-action {
  padding-left: 0 !important;
  margin-top: 4px;
}

.help-action::before {
  display: none !important;
}

.help-hours {
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--tt-border);
  font-size: 13px;
  color: var(--tt-text-secondary);
  line-height: 1.5;
}

.letter-section {
  position: relative;
  padding-bottom: 40px;
  overflow: hidden;
  border-radius: 12px 12px 0 0;
  border-bottom: none;
}

.letter-section .section-title {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--tt-border);
}

.letter-section::after {
  content: '';
  position: absolute;
  left: -1px;
  right: -1px;
  bottom: -1px;
  height: 18px;
  background: var(--tt-card);
  border: 1px solid var(--tt-border);
  border-top: none;
  border-radius: 0 0 50% 50% / 0 0 18px 18px;
  pointer-events: none;
}

.postmark {
  position: absolute;
  right: 16px;
  bottom: 14px;
  padding: 4px 10px;
  border: 2px solid rgba(248, 89, 89, 0.25);
  border-radius: 50%;
  font-size: 11px;
  color: rgba(248, 89, 89, 0.35);
  letter-spacing: 0.15em;
  transform: rotate(-12deg);
  pointer-events: none;
  user-select: none;
}

.letter-body {
  font-size: 13px;
  font-weight: 400;
  color: var(--tt-text);
  line-height: 1.85;
}

.letter-body p {
  margin: 0 0 12px;
  text-align: justify;
  text-indent: 2em;
  color: inherit;
}

.letter-body p:last-child {
  margin-bottom: 0;
}

.letter-greeting {
  margin: 0 0 12px;
  text-indent: 0 !important;
  text-align: justify;
}

.letter-sign {
  margin: 14px 48px 0 0 !important;
  padding: 12px 0 0;
  text-align: right;
  text-indent: 0 !important;
  border-top: 1px solid var(--tt-border);
}

.btn-wrap {
  padding: 16px;
}

.card-section {
  padding: 12px 0;
}

.unlock-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 16px;
}

.reservation-banner {
  text-align: center;
  margin-bottom: 20px;
  padding: 12px 20px;
  background: #fff7f7;
  border: 1px solid rgba(248, 89, 89, 0.25);
  border-radius: 8px;
  width: 100%;
  max-width: 280px;
}

.reservation-label {
  font-size: 13px;
  color: var(--tt-text-secondary);
  margin-bottom: 4px;
}

.reservation-seat {
  font-size: 22px;
  font-weight: 600;
  color: var(--tt-red);
}

.reservation-range {
  margin-top: 6px;
  font-size: 12px;
  color: var(--tt-text-secondary);
}

.user-app :deep(.unreserved) {
  color: #ed6a0c;
}

.unlock-btn {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: none;
  background: var(--tt-red);
  color: #fff;
  font-size: 22px;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(248, 89, 89, 0.35);
  cursor: pointer;
  transition: opacity 0.2s;
}

.unlock-btn:active:not(:disabled) {
  opacity: 0.85;
}

.unlock-btn:disabled {
  opacity: 0.6;
}

.hint {
  margin-top: 14px;
  font-size: 12px;
  color: var(--tt-text-secondary);
}

.user-app :deep(.main-tabs .van-tabs__wrap) {
  background: var(--tt-card);
  border-bottom: 1px solid var(--tt-border);
}

.user-app :deep(.main-tabs .van-tab) {
  color: var(--tt-text-secondary);
  font-size: 15px;
}

.user-app :deep(.main-tabs .van-tab--active) {
  color: var(--tt-text);
  font-weight: 600;
}

.user-app :deep(.van-cell-group--inset) {
  margin: 0 12px;
}
</style>

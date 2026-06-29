<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useSessionStore, type SessionInfo } from '@/stores/session';
import api, { ApiResponse } from '@/api';
import { showLoadingToast, showDialog, showSuccessToast } from 'vant';
import axios from 'axios';
import { fetchAndShowReservationDetail } from '@/utils/reservation-detail';
import SeatBooking from '@/components/SeatBooking.vue';
import ReservationDetailDialog from '@/components/ReservationDetailDialog.vue';

const session = useSessionStore();
const LAST_REDEEM_CODE_KEY = 'lastRedeemCode';
const codeInput = ref('');
const loading = ref(false);
const activeTab = ref(0);
const adminWechatId = ref('');
const adminWechatQrcodeUrl = ref('');
const meituanUrl = ref('');
const storeName = ref('朴素自习室');
const unlocking = ref(false);
const restoring = ref(false);
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
    storeName: string;
    businessHoursStart: string;
    businessHoursEnd: string;
    adminWechatId: string;
    adminWechatQrcodeUrl: string;
    meituanUrl: string;
  }>>('/settings/public');
  storeName.value = res.data.storeName || '朴素自习室';
  document.title = storeName.value;
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

function loadLastRedeemCode() {
  const saved = localStorage.getItem(LAST_REDEEM_CODE_KEY);
  if (saved) codeInput.value = saved;
}

function saveLastRedeemCode(code: string) {
  localStorage.setItem(LAST_REDEEM_CODE_KEY, code);
}

function clearLastRedeemCode() {
  localStorage.removeItem(LAST_REDEEM_CODE_KEY);
}

async function enterWithCode(digits: string, options?: { silent?: boolean }) {
  const data = await session.accessByCode(digits);
  saveLastRedeemCode(digits);
  if (!options?.silent) {
    showSuccessToast(data.membership.pending ? '请预约座位完成激活' : '已进入');
  }
  activeTab.value = data.membership.pending || !data.reservation ? 1 : 0;
  await refreshStatus();
  return data;
}

async function tryRestoreSession() {
  const saved = localStorage.getItem(LAST_REDEEM_CODE_KEY);
  if (!saved) {
    loadLastRedeemCode();
    return;
  }

  codeInput.value = saved;
  restoring.value = true;
  try {
    const previewRes = await api.post<ApiResponse<{
      isFirstRedeem: boolean;
    }>>('/redemption/preview', { code: saved }, { skipErrorToast: true });

    if (previewRes.data.isFirstRedeem) {
      return;
    }

    await enterWithCode(saved, { silent: true });
  } catch {
    clearLastRedeemCode();
    codeInput.value = '';
  } finally {
    restoring.value = false;
  }
}

async function submitCode() {
  const digits = codeInput.value.replace(/\D/g, '');
  if (digits.length !== 11) {
    showDialog({ title: '提示', message: '请输入11位数字兑换码' });
    return;
  }
  loading.value = true;
  const accessToast = showLoadingToast({ message: '验证中...', forbidClick: true });
  try {
    await enterWithCode(digits);
  } catch (err) {
    const message = axios.isAxiosError(err)
      ? err.response?.data?.message || err.message
      : '验证失败';
    await showDialog({ title: '提示', message: String(message) });
  } finally {
    accessToast.close();
    loading.value = false;
  }
}

type ActiveReservation = NonNullable<SessionInfo['reservation']>;

function formatUnlockBannerLabel(reservation: ActiveReservation) {
  return reservation.multiDay ? '固定座位' : '今日座位';
}

function formatUnlockBannerSeat(reservation: ActiveReservation) {
  if (reservation.multiDay && reservation.dayCount) {
    const mixed = reservation.assignments?.some((a) => !a.isPreferred);
    const primary = reservation.assignments?.find((a) => a.isPreferred)?.seatLabel
      || reservation.seatLabel;
    if (mixed) {
      return `${primary} · ${reservation.dayCount} 天（部分换座）`;
    }
    return `${primary} · 固定 ${reservation.dayCount} 天`;
  }
  return reservation.seatLabel;
}

function formatUnlockBannerHint(reservation: ActiveReservation) {
  if (!reservation.multiDay) return '点击查看预约详情';
  if (reservation.hasTodayReservation) {
    return `今日座位 ${reservation.seatLabel} · 点击查看每日安排`;
  }
  return '今日暂无座位 · 点击查看全部安排';
}

async function refreshStatus() {
  if (!session.isActive) return;
  const res = await api.get<ApiResponse<{
    pending?: boolean;
    businessHours: { start: string; end: string; isOpen: boolean };
    passcode: string | null;
    membership: {
      status: string;
      pending: boolean;
      startAt: string | null;
      endAt: string | null;
      productName: string;
    } | null;
    reservation: {
      seatLabel: string;
      reserveDate: string;
      multiDay?: boolean;
      dateFrom?: string | null;
      dateTo?: string | null;
      dayCount?: number;
      hasTodayReservation?: boolean;
      assignments?: { date: string; seatLabel: string; isPreferred: boolean }[];
    } | null;
  }>>('/access/status');
  businessHours.value = res.data.businessHours;
  if (session.info) {
    if (res.data.membership) {
      session.updateMembership({
        pending: res.data.membership.pending,
        status: res.data.membership.status,
        startAt: res.data.membership.startAt,
        endAt: res.data.membership.endAt,
        productName: res.data.membership.productName,
      });
    }
    if (res.data.passcode) {
      session.info.passcode = res.data.passcode;
    }
    session.updateReservation(res.data.reservation);
  }
}

async function showMyReservation() {
  const data = await fetchAndShowReservationDetail();
  if (data?.seatLabel && data.reserveDate && session.info) {
    session.updateReservation({
      seatLabel: data.seatLabel,
      reserveDate: data.reserveDate,
      multiDay: data.multiDay,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      dayCount: data.dayCount,
      hasTodayReservation: data.hasTodayReservation,
      assignments: data.assignments,
    });
  }
}

async function unlock() {
  if (!session.isActive) return;
  if (session.isPending) {
    showDialog({
      title: '提示',
      message: '会员卡尚未激活，请先前往「预约座位」完成预约',
      confirmButtonText: '去预约',
    }).then(() => {
      activeTab.value = 1;
    });
    return;
  }
  if (!session.isMembershipActiveToday()) {
    showDialog({
      title: '提示',
      message: '当前不在会员卡有效期内，无法开门。请在预约的使用日内再试。',
    });
    return;
  }
  if (!businessHours.value.isOpen) {
    showDialog({
      title: '提示',
      message: `当前非营业时间（${formatBusinessHoursRange()}）`,
    });
    return;
  }
  if (!session.info?.reservation?.hasTodayReservation) {
    showDialog({
      title: '提示',
      message: session.info?.reservation
        ? '今日无预约座位。您可在「我的预约」查看全部安排，或在使用日当天再来开门。'
        : '您尚未预约座位，请先前往「预约座位」完成预约',
      confirmButtonText: session.info?.reservation ? '查看我的预约' : '去预约',
    }).then((action) => {
      if (action === 'confirm') {
        if (session.info?.reservation) {
          showMyReservation();
        } else {
          activeTab.value = 1;
        }
      }
    });
    return;
  }
  if (!session.info?.reservation) {
    return;
  }
  unlocking.value = true;
  const loadingToast = showLoadingToast({ message: '开门中...', forbidClick: true });
  try {
    const res = await api.post<ApiResponse<{ method: string; passcode?: string; reservation?: { seatLabel: string } }>>('/access/unlock');
    loadingToast.close();
    if (res.data.method === 'remote') {
      showSuccessToast(`开门成功，请前往 ${res.data.reservation?.seatLabel || session.info.reservation.seatLabel}`);
    } else if (res.data.passcode) {
      showDialog({
        title: '请使用备用密码',
        message: `远程开门失败，请在门锁键盘输入：\n\n${res.data.passcode}\n\n您的座位：${session.info.reservation.seatLabel}`,
      });
    }
  } catch {
    loadingToast.close();
  } finally {
    unlocking.value = false;
  }
}

function showPasscode() {
  if (!session.info?.passcode) return;
  showDialog({ title: '门锁备用密码', message: session.info.passcode });
}

function exitSession() {
  session.clear();
  activeTab.value = 0;
  clearLastRedeemCode();
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

watch(activeTab, (tab) => {
  if (tab === 0 && session.isActive) {
    refreshStatus();
  }
});

onMounted(async () => {
  loadSettings();
  if (session.isActive) {
    activeTab.value = 0;
    await refreshStatus();
  } else {
    await tryRestoreSession();
  }
});
</script>

<template>
  <div class="user-app">
    <div v-if="restoring" class="restore-screen">
      <van-loading vertical size="24px">正在恢复...</van-loading>
    </div>
    <div v-else-if="!session.isActive" class="home-page">
      <header class="home-brand">
        <p class="brand-title">{{ storeName }} · 办公·考研·考公</p>
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
        <p class="redeem-tip">输入管理员提供的11位兑换码进入；进入后完成「预约座位」，方可进行开门。</p>
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
            <li>输入兑换码完成兑换</li>
            <li>前往「预约座位」选择日期并确认预约（预约后激活）</li>
            <li>在有效使用日、营业时间内点击「开门」进入</li>
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
          营业时间 {{ formatBusinessHoursRange() }}
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
      <van-tabs v-model:active="activeTab" sticky offset-top="0" class="main-tabs">
        <van-tab title="使用开门">
          <div class="card-section">
            <van-cell-group inset>
              <van-cell title="兑换码" :value="session.info!.code" />
              <van-cell title="卡类型" :value="session.info!.membership.productName" />
              <van-cell
                v-if="session.isPending"
                title="状态"
                value="待预约激活"
                value-class="unreserved"
              />
              <template v-else>
                <van-cell title="生效时间" :value="session.info!.membership.startAt ? new Date(session.info!.membership.startAt).toLocaleString('zh-CN') : '-'" />
                <van-cell title="有效期至" :value="session.info!.membership.endAt ? new Date(session.info!.membership.endAt).toLocaleString('zh-CN') : '-'" />
              </template>
              <van-cell
                v-if="session.isPending"
                title="座位"
                value="待预约"
                value-class="unreserved"
              />
              <van-cell
                v-else-if="!session.info!.reservation"
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
            <van-notice-bar
              v-if="session.isPending"
              wrapable
              :scrollable="false"
              text="请先完成预约以激活会员卡，激活后在有效使用日内可开门"
              color="#ed6a0c"
              background="#fffbe8"
              left-icon="warning-o"
            />
            <button
              v-else-if="session.info!.reservation"
              type="button"
              class="reservation-banner reservation-banner-clickable"
              @click="showMyReservation"
            >
              <p class="reservation-label">{{ formatUnlockBannerLabel(session.info!.reservation) }}</p>
              <p class="reservation-seat">{{ formatUnlockBannerSeat(session.info!.reservation) }}</p>
              <p
                v-if="session.info!.reservation.multiDay && session.info!.reservation.dateFrom"
                class="reservation-range"
              >
                {{ session.info!.reservation.dateFrom }} 至 {{ session.info!.reservation.dateTo }}
              </p>
              <p class="reservation-detail-link">{{ formatUnlockBannerHint(session.info!.reservation) }}</p>
            </button>
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
          </div>

          <div class="btn-wrap">
            <van-button block round plain hairline type="default" @click="exitSession">
              切换兑换码
            </van-button>
          </div>

          <div class="session-footer">
            <p class="hint">营业时间 {{ formatBusinessHoursRange() }} · 远程开门，失败时将提示备用密码</p>
            <button type="button" class="footer-wechat" @click="copyWechatId">
              <span class="footer-wechat-label">管理员微信</span>
              <span class="footer-wechat-id">{{ adminWechatId || '待配置' }}</span>
              <span class="footer-wechat-action">点击复制</span>
            </button>
          </div>
        </van-tab>

        <van-tab title="预约座位">
          <SeatBooking :active="activeTab === 1" />
        </van-tab>
      </van-tabs>
    </template>

    <ReservationDetailDialog />
  </div>
</template>

<style scoped>
.user-app {
  min-height: 100vh;
  padding-bottom: 24px;
  background: var(--tt-bg);
}

.restore-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
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
  padding: 16px 16px 4px;
}

.session-footer {
  padding: 16px 16px 24px;
  text-align: center;
}

.footer-wechat {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 10px 0 0;
  padding: 8px 12px;
  border: none;
  border-radius: 999px;
  background: #f7f8fa;
  font-size: 12px;
  color: var(--tt-text-secondary);
  cursor: pointer;
}

.footer-wechat:active {
  background: #eef0f3;
}

.footer-wechat-label {
  color: var(--tt-text-secondary);
}

.footer-wechat-id {
  color: var(--tt-text);
  font-weight: 500;
}

.footer-wechat-action {
  color: #07c160;
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

.reservation-banner-clickable {
  cursor: pointer;
  transition: background 0.15s;
}

.reservation-banner-clickable:active {
  background: #fff0f0;
}

.reservation-label {
  font-size: 13px;
  color: var(--tt-text-secondary);
  margin-bottom: 4px;
}

.reservation-seat {
  font-size: 18px;
  line-height: 1.45;
  font-weight: 600;
  color: var(--tt-red);
}

.reservation-range {
  margin-top: 6px;
  font-size: 12px;
  color: var(--tt-text-secondary);
}

.reservation-detail-link {
  margin: 8px 0 0;
  font-size: 12px;
  color: #07c160;
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
  margin: 0;
  font-size: 12px;
  color: var(--tt-text-secondary);
  line-height: 1.6;
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

@media screen and (max-width: 768px) {
  .brand-title {
    font-size: 17px;
  }

  .brand-desc {
    font-size: 15px;
  }

  .section-title {
    font-size: 17px;
  }

  .section-lead,
  .letter-body,
  .help-steps li,
  .help-tab,
  .help-hours,
  .wechat-row-value,
  .reservation-label {
    font-size: 14px;
  }

  .redeem-tip,
  .hint,
  .qrcode-tip,
  .wechat-row-label,
  .letter-sign {
    font-size: 13px;
  }

  .qrcode-placeholder,
  .wechat-copy-btn,
  .help-steps li::before,
  .postmark {
    font-size: 12px;
  }

  .user-app :deep(.main-tabs .van-tab) {
    font-size: 16px;
  }
}
</style>

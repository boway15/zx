import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api, { ApiResponse } from '@/api';

export interface SessionInfo {
  code: string;
  membership: {
    id: string;
    productName: string;
    startAt: string;
    endAt: string;
  };
  passcode?: string;
  passcodeValidTo?: string;
  reservation?: {
    seatLabel: string;
    reserveDate: string;
    multiDay?: boolean;
    dateFrom?: string | null;
    dateTo?: string | null;
    dayCount?: number;
  } | null;
}

export const useSessionStore = defineStore('session', () => {
  const token = ref(sessionStorage.getItem('membershipToken') || '');
  const info = ref<SessionInfo | null>(
    sessionStorage.getItem('sessionInfo')
      ? JSON.parse(sessionStorage.getItem('sessionInfo')!)
      : null,
  );

  const isActive = computed(() => !!token.value && !!info.value);

  function setSession(data: {
    accessToken: string;
    code: string;
    membership: SessionInfo['membership'];
    passcode?: string;
    passcodeValidTo?: string;
    reservation?: SessionInfo['reservation'];
  }) {
    token.value = data.accessToken;
    info.value = {
      code: data.code,
      membership: data.membership,
      passcode: data.passcode,
      passcodeValidTo: data.passcodeValidTo,
      reservation: data.reservation,
    };
    sessionStorage.setItem('membershipToken', data.accessToken);
    sessionStorage.setItem('sessionInfo', JSON.stringify(info.value));
  }

  function updateReservation(reservation: SessionInfo['reservation']) {
    if (info.value) {
      info.value.reservation = reservation;
      sessionStorage.setItem('sessionInfo', JSON.stringify(info.value));
    }
  }

  function clear() {
    token.value = '';
    info.value = null;
    sessionStorage.removeItem('membershipToken');
    sessionStorage.removeItem('sessionInfo');
  }

  async function accessByCode(code: string) {
    const normalized = code.replace(/\D/g, '');
    const res = await api.post<ApiResponse<{
      accessToken: string;
      code: string;
      membership: SessionInfo['membership'];
      passcode?: string;
      passcodeValidTo?: string;
      reservation?: SessionInfo['reservation'];
    }>>('/redemption/access', { code: normalized });
    setSession(res.data);
    return res.data;
  }

  function formatValidity() {
    if (!info.value) return '';
    const { startAt, endAt, productName } = info.value.membership;
    return `${productName} · ${new Date(startAt).toLocaleDateString('zh-CN')} 至 ${new Date(endAt).toLocaleString('zh-CN')}`;
  }

  return { token, info, isActive, setSession, updateReservation, clear, accessByCode, formatValidity };
});

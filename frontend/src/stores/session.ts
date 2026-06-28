import { defineStore } from 'pinia';

import { ref, computed } from 'vue';

import api, { ApiResponse } from '@/api';



export interface SessionInfo {

  code: string;

  membership: {

    id: string;

    productName: string;

    productType?: string;

    status?: string;

    pending?: boolean;

    startAt: string | null;

    endAt: string | null;

    naturalDays?: number;

    bookingHorizonDays?: number;

    redeemValidUntil?: string;

  };

  passcode?: string | null;

  passcodeValidTo?: string;

  reservation?: {

    seatLabel: string;

    reserveDate: string;

    multiDay?: boolean;

    dateFrom?: string | null;

    dateTo?: string | null;

    dayCount?: number;

    hasTodayReservation?: boolean;

    assignments?: { date: string; seatLabel: string; isPreferred: boolean }[];

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

  const isPending = computed(() => !!info.value?.membership.pending);



  function setSession(data: {

    accessToken: string;

    code: string;

    membership: SessionInfo['membership'];

    passcode?: string | null;

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



  function updateMembership(membership: Partial<SessionInfo['membership']>) {

    if (info.value) {

      info.value.membership = { ...info.value.membership, ...membership };

      sessionStorage.setItem('sessionInfo', JSON.stringify(info.value));

    }

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

      passcode?: string | null;

      passcodeValidTo?: string;

      reservation?: SessionInfo['reservation'];

    }>>('/redemption/access', { code: normalized }, { skipErrorToast: true });

    setSession(res.data);

    return res.data;

  }



  function formatValidity() {

    if (!info.value) return '';

    const { startAt, endAt, productName, pending } = info.value.membership;

    if (pending || !startAt || !endAt) {

      return `${productName} · 待预约激活`;

    }

    return `${productName} · ${formatNaturalDay(startAt)} 至 ${formatNaturalDayEnd(endAt)}`;

  }



  function formatNaturalDay(value: string | Date) {

    return new Date(value).toLocaleDateString('zh-CN');

  }



  function formatNaturalDayEnd(value: string | Date) {

    return `${formatNaturalDay(value)} 23:59`;

  }



  function isMembershipActiveToday() {

    if (!info.value?.membership.startAt || !info.value?.membership.endAt) return false;

    const now = new Date();

    const start = new Date(info.value.membership.startAt);

    start.setHours(0, 0, 0, 0);

    const end = new Date(info.value.membership.endAt);

    return now >= start && now <= end;

  }



  return {

    token,

    info,

    isActive,

    isPending,

    setSession,

    updateMembership,

    updateReservation,

    clear,

    accessByCode,

    formatValidity,

    isMembershipActiveToday,

  };

});


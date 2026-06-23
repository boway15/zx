export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'zxs',
    password: process.env.DB_PASSWORD || 'zxs123',
    database: process.env.DB_NAME || 'zxs',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    adminSecret: process.env.ADMIN_JWT_SECRET || 'admin-change-me',
    adminExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '1d',
  },
  wechat: {
    appId: process.env.WECHAT_APP_ID || '',
    appSecret: process.env.WECHAT_APP_SECRET || '',
    mchId: process.env.WECHAT_MCH_ID || '',
    apiV3Key: process.env.WECHAT_API_V3_KEY || '',
    notifyUrl: process.env.WECHAT_NOTIFY_URL || '',
    mockPay: process.env.WECHAT_MOCK_PAY === 'true',
  },
  ttlock: {
    clientId: process.env.TTLOCK_CLIENT_ID || '',
    clientSecret: process.env.TTLOCK_CLIENT_SECRET || '',
    username: process.env.TTLOCK_USERNAME || '',
    password: process.env.TTLOCK_PASSWORD || '',
    apiBase: process.env.TTLOCK_API_BASE || 'https://cnapi.ttlock.com',
    lockId: parseInt(process.env.TTLOCK_LOCK_ID || '0', 10),
    gatewayId: parseInt(process.env.TTLOCK_GATEWAY_ID || '0', 10),
    mockUnlock: process.env.TTLOCK_MOCK_UNLOCK === 'true',
  },
  app: {
    baseUrl: process.env.APP_BASE_URL || 'http://localhost',
    businessHoursStart: process.env.BUSINESS_HOURS_START || '08:00',
    businessHoursEnd: process.env.BUSINESS_HOURS_END || '22:00',
  },
});

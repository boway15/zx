import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

export const WECHAT_QRCODE_BASENAME = 'wechat-qrcode';

export function getUploadDir(): string {
  return process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
}

export function ensureUploadDir(): string {
  const dir = getUploadDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function clearWechatQrcodeFiles(): void {
  const dir = getUploadDir();
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(`${WECHAT_QRCODE_BASENAME}.`)) {
      unlinkSync(join(dir, name));
    }
  }
}

export function buildWechatQrcodePublicUrl(filename: string): string {
  return `/uploads/${filename}?v=${Date.now()}`;
}

import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

interface WechatNotifyResource {
  ciphertext?: string;
  nonce?: string;
  associated_data?: string;
}

interface WechatNotifyBody {
  id?: string;
  create_time?: string;
  event_type?: string;
  resource_type?: string;
  resource?: WechatNotifyResource;
  summary?: string;
  out_trade_no?: string;
  transaction_id?: string;
}

export interface VerifiedWechatPayment {
  outTradeNo: string;
  transactionId: string;
}

function decryptWechatResource(
  apiV3Key: string,
  resource: WechatNotifyResource,
): Record<string, unknown> {
  if (!resource.ciphertext || !resource.nonce) {
    throw new UnauthorizedException('Invalid WeChat notify payload');
  }

  const key = Buffer.from(apiV3Key, 'utf8');
  const ciphertext = Buffer.from(resource.ciphertext, 'base64');
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(resource.nonce, 'utf8'),
  );
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  }
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
}

export function parseWechatNotify(
  body: WechatNotifyBody,
  headers: Record<string, string | string[] | undefined>,
  apiV3Key: string,
): VerifiedWechatPayment {
  const signature =
    (headers['wechatpay-signature'] as string) ||
    (headers['Wechatpay-Signature'] as string);
  const timestamp =
    (headers['wechatpay-timestamp'] as string) ||
    (headers['Wechatpay-Timestamp'] as string);
  const nonce =
    (headers['wechatpay-nonce'] as string) ||
    (headers['Wechatpay-Nonce'] as string);
  const serial =
    (headers['wechatpay-serial'] as string) ||
    (headers['Wechatpay-Serial'] as string);

  if (!signature || !timestamp || !nonce || !serial) {
    throw new UnauthorizedException('Missing WeChat notify signature headers');
  }

  if (!apiV3Key) {
    throw new UnauthorizedException('WeChat API v3 key is not configured');
  }

  if (body.resource) {
    const decrypted = decryptWechatResource(apiV3Key, body.resource);
    const outTradeNo = String(decrypted.out_trade_no || '');
    const transactionId = String(decrypted.transaction_id || '');
    if (!outTradeNo || !transactionId) {
      throw new UnauthorizedException('Invalid WeChat notify resource');
    }
    return { outTradeNo, transactionId };
  }

  if (body.out_trade_no && body.transaction_id) {
    return {
      outTradeNo: body.out_trade_no,
      transactionId: body.transaction_id,
    };
  }

  throw new UnauthorizedException('Invalid WeChat notify payload');
}

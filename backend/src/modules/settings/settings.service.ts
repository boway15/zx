import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../../entities/setting.entity';
import { buildWechatQrcodePublicUrl } from '../../common/upload.util';

const DEFAULTS: Record<string, string> = {
  business_hours_start: '08:00',
  business_hours_end: '22:00',
  passcode_fallback_enabled: 'true',
  store_name: '朴素自习室',
  admin_wechat_id: '',
  admin_wechat_qrcode_url: '',
  meituan_url: '',
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private cache = new Map<string, string>();

  constructor(
    @InjectRepository(Setting)
    private readonly settingRepo: Repository<Setting>,
  ) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.loadCache();
  }

  private async seedDefaults() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      const existing = await this.settingRepo.findOne({ where: { key } });
      if (!existing) {
        await this.settingRepo.save(this.settingRepo.create({ key, value }));
      }
    }
  }

  private async loadCache() {
    const settings = await this.settingRepo.find();
    this.cache.clear();
    for (const s of settings) {
      this.cache.set(s.key, s.value);
    }
  }

  getSync(key: string): string | undefined {
    return this.cache.get(key);
  }

  async get(key: string): Promise<string | undefined> {
    if (this.cache.has(key)) return this.cache.get(key);
    const setting = await this.settingRepo.findOne({ where: { key } });
    if (setting) {
      this.cache.set(key, setting.value);
      return setting.value;
    }
    return undefined;
  }

  async getAll(): Promise<Record<string, string>> {
    await this.loadCache();
    return Object.fromEntries(this.cache);
  }

  async set(key: string, value: string): Promise<void> {
    let setting = await this.settingRepo.findOne({ where: { key } });
    if (setting) {
      setting.value = value;
    } else {
      setting = this.settingRepo.create({ key, value });
    }
    await this.settingRepo.save(setting);
    this.cache.set(key, value);
  }

  async setMany(data: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      await this.set(key, value);
    }
  }

  async setWechatQrcodeUrl(filename: string): Promise<string> {
    const url = buildWechatQrcodePublicUrl(filename);
    await this.set('admin_wechat_qrcode_url', url);
    return url;
  }
}

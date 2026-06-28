import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { SettingsService } from './settings.service';
import { AdminAuthGuard } from '../../common/guards/auth.guards';
import { UpdateSettingsDto } from './settings.dto';
import { validateSettingsPayload } from './settings-validation.util';
import {
  clearWechatQrcodeFiles,
  ensureUploadDir,
  WECHAT_QRCODE_BASENAME,
} from '../../common/upload.util';

const IMAGE_MIME = /^image\/(jpeg|png|webp|gif)$/;

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('public')
  async getPublic() {
    const all = await this.settingsService.getAll();
    return {
      success: true,
      data: {
        storeName: all.store_name,
        businessHoursStart: all.business_hours_start,
        businessHoursEnd: all.business_hours_end,
        adminWechatId: all.admin_wechat_id || '',
        adminWechatQrcodeUrl: all.admin_wechat_qrcode_url || '',
        meituanUrl: all.meituan_url || '',
      },
    };
  }

  @Get('admin')
  @UseGuards(AdminAuthGuard)
  async getAll() {
    const data = await this.settingsService.getAll();
    return { success: true, data };
  }

  @Put('admin')
  @UseGuards(AdminAuthGuard)
  async update(@Body() dto: UpdateSettingsDto) {
    validateSettingsPayload(dto.settings);
    await this.settingsService.setMany(dto.settings);
    const data = await this.settingsService.getAll();
    return { success: true, data };
  }

  @Post('admin/wechat-qrcode')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!IMAGE_MIME.test(file.mimetype)) {
          cb(new BadRequestException('仅支持 JPG、PNG、WebP、GIF 图片'), false);
          return;
        }
        cb(null, true);
      },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, ensureUploadDir());
        },
        filename: (_req, file, cb) => {
          clearWechatQrcodeFiles();
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${WECHAT_QRCODE_BASENAME}${ext}`);
        },
      }),
    }),
  )
  async uploadWechatQrcode(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请选择图片文件');
    }
    const url = await this.settingsService.setWechatQrcodeUrl(file.filename);
    return { success: true, data: { url } };
  }
}

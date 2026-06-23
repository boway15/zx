import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuthGuard } from '../../common/guards/auth.guards';
import { AccessService } from '../access/access.service';
import { MembershipService } from '../membership/membership.service';
import { UserService } from '../user/user.service';
import { ProductService } from '../product/product.service';
import { User } from '../../entities/user.entity';
import { ManualGrantDto } from './admin.dto';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly accessService: AccessService,
    private readonly membershipService: MembershipService,
    private readonly userService: UserService,
    private readonly productService: ProductService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Get('dashboard')
  @UseGuards(AdminAuthGuard)
  async dashboard() {
    const [todayUnlocks, activeMembers] = await Promise.all([
      this.accessService.countTodayUnlocks(),
      this.membershipService.countActive(),
    ]);
    return {
      success: true,
      data: { todayUnlocks, activeMembers },
    };
  }

  @Get('memberships')
  @UseGuards(AdminAuthGuard)
  async memberships() {
    const data = await this.membershipService.listActive();
    return { success: true, data };
  }

  @Get('users')
  @UseGuards(AdminAuthGuard)
  async users(@Query('page') page?: string, @Query('limit') limit?: string) {
    const p = parseInt(page || '1', 10);
    const l = parseInt(limit || '20', 10);
    const [items, total] = await this.userRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (p - 1) * l,
      take: l,
    });
    return { success: true, data: { items, total, page: p, limit: l } };
  }

  @Post('memberships/grant')
  @UseGuards(AdminAuthGuard)
  async manualGrant(@Body() dto: ManualGrantDto) {
    const product = await this.productService.findById(dto.productId);
    let user = await this.userService.findByOpenid(dto.openid);
    if (!user) {
      user = await this.userService.createOrUpdate(dto.openid, dto.nickname);
    }
    const membership = await this.membershipService.manualGrant(user.id, product);
    return { success: true, data: membership, message: '手动开卡成功' };
  }
}

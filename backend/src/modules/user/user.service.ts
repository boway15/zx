import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findByOpenid(openid: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { openid } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { phone } });
  }

  async createOrUpdateByPhone(phone: string, nickname?: string): Promise<User> {
    let user = await this.findByPhone(phone);
    if (user) {
      if (nickname && user.nickname !== nickname) {
        user.nickname = nickname;
        await this.userRepo.save(user);
      }
      return user;
    }
    const openid = `phone_${phone}`;
    user = this.userRepo.create({ openid, phone, nickname: nickname || `用户${phone.slice(-4)}` });
    return this.userRepo.save(user);
  }

  async createOrUpdate(openid: string, nickname?: string): Promise<User> {
    let user = await this.findByOpenid(openid);
    if (user) {
      if (nickname && user.nickname !== nickname) {
        user.nickname = nickname;
        await this.userRepo.save(user);
      }
      return user;
    }
    user = this.userRepo.create({ openid, nickname });
    return this.userRepo.save(user);
  }

  async updatePhone(userId: string, phone: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error('用户不存在');
    user.phone = phone;
    return this.userRepo.save(user);
  }
}

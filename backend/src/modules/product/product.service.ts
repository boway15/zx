import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductType } from '../../entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './product.dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async findAllEnabled(): Promise<Product[]> {
    return this.productRepo.find({
      where: { enabled: true },
      order: { priceFen: 'ASC' },
    });
  }

  async findAll(): Promise<Product[]> {
    return this.productRepo.find({ order: { createdAt: 'ASC' } });
  }

  async findById(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('卡类型不存在');
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepo.create(dto);
    return this.productRepo.save(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findById(id);
    Object.assign(product, dto);
    return this.productRepo.save(product);
  }

  async seedDefaults() {
    const count = await this.productRepo.count();
    if (count > 0) return;

    const defaults = [
      { name: '日卡', type: ProductType.DAY, durationHours: 24, priceFen: 2000, description: '1个自然日有效' },
      { name: '周卡', type: ProductType.WEEK, durationHours: 168, priceFen: 9800, description: '7个自然日有效' },
      { name: '月卡', type: ProductType.MONTH, durationHours: 720, priceFen: 29800, description: '30个自然日有效' },
    ];
    for (const item of defaults) {
      await this.productRepo.save(this.productRepo.create(item));
    }
  }
}

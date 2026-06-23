import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto, UpdateProductDto } from './product.dto';
import { AdminAuthGuard } from '../../common/guards/auth.guards';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  async listPublic() {
    const products = await this.productService.findAllEnabled();
    return { success: true, data: products };
  }

  @Get('admin/all')
  @UseGuards(AdminAuthGuard)
  async listAll() {
    const products = await this.productService.findAll();
    return { success: true, data: products };
  }

  @Post('admin')
  @UseGuards(AdminAuthGuard)
  async create(@Body() dto: CreateProductDto) {
    const product = await this.productService.create(dto);
    return { success: true, data: product };
  }

  @Put('admin/:id')
  @UseGuards(AdminAuthGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    const product = await this.productService.update(id, dto);
    return { success: true, data: product };
  }
}

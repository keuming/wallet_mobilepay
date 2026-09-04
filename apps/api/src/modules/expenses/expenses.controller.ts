import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class SetTransactionCategoryDto {
  @IsOptional()
  @IsString()
  categoryId: string | null;
}

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  @Get('categories')
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.expensesService.listCategories(user.userId);
  }

  @Post('categories')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.expensesService.createCategory(user.userId, dto.label, dto.icon);
  }

  @Delete('categories/:id')
  deleteCategory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.expensesService.deleteCategory(user.userId, id);
  }

  @Get('statement')
  getStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.expensesService.getStatement(user.userId, from, to, categoryId);
  }

  @Patch('transactions/:id/category')
  setTransactionCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetTransactionCategoryDto,
  ) {
    return this.expensesService.setTransactionCategory(user.userId, id, dto.categoryId ?? null);
  }
}

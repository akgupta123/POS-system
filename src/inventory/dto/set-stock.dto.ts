import { IsInt, Max, Min } from 'class-validator';

export class SetStockDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity: number;
}

import { IsInt, Max, Min } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  delta: number;
}

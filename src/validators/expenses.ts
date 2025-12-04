import {
  IsString,
  IsNotEmpty,
  IsMongoId,
  IsNumber,
  Min,
  IsEnum,
  ValidateNested,
  IsOptional,
} from "class-validator";
import { Type } from "class-transformer";

class CurrencyDetailsDto {
  @IsNumber({}, { message: "Dollar qiymati raqam bo'lishi kerak" })
  @Min(0, { message: "Dollar qiymati manfiy bo'lmasligi kerak" })
  dollar: number;

  @IsNumber({}, { message: "So'm qiymati raqam bo'lishi kerak" })
  @Min(0, { message: "So'm qiymati manfiy bo'lmasligi kerak" })
  sum: number;
}

export class AddExpensesDto {
  @IsString({ message: "Izoh matn bo'lishi kerak" })
  @IsOptional()
  notes?: string;

  @ValidateNested()
  @Type(() => CurrencyDetailsDto)
  currencyDetails: CurrencyDetailsDto;
}

export class UpdateExpensesDto extends AddExpensesDto {
  @IsMongoId({ message: "Xarajat ID noto'g'ri" })
  @IsNotEmpty({ message: "Xarajat ID bo'sh bo'lmasligi kerak" })
  _id: string;
}

export class withdrawFromBalanceDto {
  @IsMongoId({ message: "Xarajat ID noto'g'ri" })
  @IsNotEmpty({ message: "Xarajat ID bo'sh bo'lmasligi kerak" })
  _id: string;

  @ValidateNested()
  @Type(() => CurrencyDetailsDto)
  currencyDetails: CurrencyDetailsDto;

  @IsString({ message: "Izoh matn bo'lishi kerak" })
  @IsOptional()
  notes?: string;
}

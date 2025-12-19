import {
  IsString,
  IsNotEmpty,
  IsMongoId,
  IsNumber,
  Min,
  IsEnum,
  ValidateNested,
  IsOptional,
  IsDateString,
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

export class PayDto {
  @IsNumber({}, { message: "To'lov miqdori raqam bo'lishi kerak" })
  @Min(0, { message: "To'lov miqdori manfiy bo'lmasligi kerak" })
  amount: number;

  @IsString({ message: "Izoh matn bo'lishi kerak" })
  @IsOptional()
  notes?: string;

  @IsNumber({}, { message: "Target oy raqam bo'lishi kerak" })
  @Min(1, { message: "Target oy 1 dan kichik bo'lmasligi kerak" })
  targetMonth: number; // ✅ Yangi: Qaysi oyga to'lov qilinayotgani (REQUIRED)

  @IsDateString({}, { message: "Keyingi to'lov sanasi noto'g'ri formatda" })
  @IsOptional()
  nextPaymentDate?: string; // ✅ YANGI: Kam to'lov bo'lsa, qolgan qismini qachon to'lash kerak

  @ValidateNested()
  @Type(() => CurrencyDetailsDto)
  currencyDetails: CurrencyDetailsDto;

  @IsNumber({}, { message: "Dollar kurs raqam bo'lishi kerak" })
  @Min(0, { message: "Dollar kurs manfiy bo'lmasligi kerak" })
  currencyCourse: number;
}

export class PayDebtDto extends PayDto {
  @IsMongoId({ message: "Debtor ID noto'g'ri" })
  @IsNotEmpty({ message: "Debtor ID bo'sh bo'lmasligi kerak" })
  id: string;
}

export class PayNewDebtDto extends PayDto {
  @IsMongoId({ message: "Contract ID noto'g'ri" })
  @IsNotEmpty({ message: "Contract ID bo'sh bo'lmasligi kerak" })
  id: string;
}

// Yangi validator'lar - Payment Service uchun

export class ReceivePaymentDto {
  @IsMongoId({ message: "Contract ID noto'g'ri" })
  @IsNotEmpty({ message: "Contract ID bo'sh bo'lmasligi kerak" })
  contractId: string;

  @IsNumber({}, { message: "To'lov miqdori raqam bo'lishi kerak" })
  @Min(0.01, { message: "To'lov miqdori musbat bo'lishi kerak" })
  amount: number;

  @IsString({ message: "Izoh matn bo'lishi kerak" })
  @IsOptional()
  notes?: string;

  @IsDateString({}, { message: "Keyingi to'lov sanasi noto'g'ri formatda" })
  @IsOptional()
  nextPaymentDate?: string; // ✅ YANGI: Kam to'lov bo'lsa, qolgan qismini qachon to'lash kerak

  @ValidateNested()
  @Type(() => CurrencyDetailsDto)
  currencyDetails: CurrencyDetailsDto;

  @IsNumber({}, { message: "Dollar kurs raqam bo'lishi kerak" })
  @Min(0, { message: "Dollar kurs manfiy bo'lmasligi kerak" })
  currencyCourse: number;
}

export class ConfirmPaymentDto {
  @IsMongoId({ message: "Payment ID noto'g'ri" })
  @IsNotEmpty({ message: "Payment ID bo'sh bo'lmasligi kerak" })
  paymentId: string;
}

export class RejectPaymentDto {
  @IsMongoId({ message: "Payment ID noto'g'ri" })
  @IsNotEmpty({ message: "Payment ID bo'sh bo'lmasligi kerak" })
  paymentId: string;

  @IsString({ message: "Rad etish sababi matn bo'lishi kerak" })
  @IsNotEmpty({ message: "Rad etish sababi bo'sh bo'lmasligi kerak" })
  reason: string;
}

export class ConfirmPaymentsDto {
  @IsMongoId({ each: true, message: "Payment ID'lar noto'g'ri" })
  @IsNotEmpty({ message: "Payment ID'lar bo'sh bo'lmasligi kerak" })
  paymentIds: string[];
}

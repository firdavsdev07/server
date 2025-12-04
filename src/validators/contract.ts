import { Type } from "class-transformer";
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsMongoId,
  IsNumber,
  Min,
  IsDateString,
  IsBoolean,
  IsArray,
  ValidateNested,
} from "class-validator";

class ContractDto {
  @IsMongoId({ message: "Mijoz biriktirilmagan" })
  @IsNotEmpty({ message: "Mijoz biriktirilmagan" })
  customer: string;

  @IsString({ message: "Maxsulot nomi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Maxsulot nomi bo'sh bo'lmasligi kerak" })
  productName: string;

  @IsNumber({}, { message: "Asl narx raqam bo'lishi kerak" })
  @Min(0, { message: "Asl narx manfiy bo'lmasligi kerak" })
  originalPrice: number;

  @IsNumber({}, { message: "Narx raqam bo'lishi kerak" })
  @Min(0, { message: "Narx manfiy bo'lmasligi kerak" })
  price: number;

  @IsNumber({}, { message: "Boshlang'ich to'lov raqam bo'lishi kerak" })
  @Min(0, { message: "Boshlang'ich to'lov manfiy bo'lmasligi kerak" })
  initialPayment: number;

  @IsNumber({}, { message: "Davr raqam bo'lishi kerak" })
  @Min(1, { message: "Davr kamida 1 oy bo'lishi kerak" })
  period: number;

  @IsDateString(
    {},
    { message: "Boshlang'ich to'lov muddati noto'g'ri formatda" }
  )
  initialPaymentDueDate: Date;

  @IsString({ message: "Izoh satr bo'lishi kerak" })
  @IsOptional()
  notes?: string;

  @IsBoolean({ message: "Quti boolean bo'lishi kerak" })
  @IsNotEmpty({ message: "Quti bo'sh bo'lmasligi kerak" })
  box: boolean;

  @IsBoolean({ message: "Muslim quti boolean bo'lishi kerak" })
  @IsNotEmpty({ message: "Muslim quti bo'sh bo'lmasligi kerak" })
  mbox: boolean;

  @IsBoolean({ message: "Tilxat boolean bo'lishi kerak" })
  @IsNotEmpty({ message: "Tilxat bo'sh bo'lmasligi kerak" })
  receipt: boolean;

  @IsBoolean({ message: "iCloud boolean bo'lishi kerak" })
  @IsNotEmpty({ message: "iCloud bo'sh bo'lmasligi kerak" })
  iCloud: boolean;
}

export class CreatePaymentItemDto {
  @IsNumber({}, { message: "To'lov miqdori raqam bo'lishi kerak" })
  @IsNotEmpty({ message: "To'lov miqdori bo'sh bo'lmasligi kerak" })
  @Min(0.01, { message: "To'lov miqdori musbat bo'lishi kerak" })
  amount: number;

  @IsDateString({}, { message: "To'lov sanasi noto'g'ri formatda" })
  @IsNotEmpty({ message: "To'lov sanasi bo'sh bo'lmasligi kerak" })
  date: string;

  @IsOptional()
  @IsString({ message: "Izoh noto'g'ri formatda" })
  note?: string;
}

export class CreateContractDto extends ContractDto {
  @IsNumber({}, { message: "Foiz raqam bo'lishi kerak" })
  @Min(0, { message: "Foiz manfiy bo'lmasligi kerak" })
  percentage: number;

  @IsNumber({}, { message: "Oylik to'lov raqam bo'lishi kerak" })
  @Min(0, { message: "Oylik to'lov manfiy bo'lmasligi kerak" })
  monthlyPayment: number;

  @IsNumber({}, { message: "Umumiy narx raqam bo'lishi kerak" })
  @Min(0, { message: "Umumiy narx manfiy bo'lmasligi kerak" })
  totalPrice: number;

  @IsOptional()
  @IsDateString({}, { message: "Shartnoma sanasi noto'g'ri formatda" })
  @IsNotEmpty({ message: "Shartnoma sanasi bo'sh bo'lmasligi kerak" })
  startDate: Date;

  @IsOptional()
  @IsArray({ message: "To'lovlar ro'yxati massiv bo'lishi kerak" })
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentItemDto)
  payments?: CreatePaymentItemDto[];
}

/**
 * Shartnoma tahrirlash uchun DTO
 * ContractDto'dan extends qiladi va qo'shimcha fieldlarni optional qiladi
 */
export class UpdateContractDto extends ContractDto {
  @IsString({ message: "Id satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Id bo'sh bo'lmasligi kerak" })
  @IsMongoId({ message: "Id noto'g'ri MongoId formatida bo'lishi kerak" })
  id: string;

  // Optional fieldlar - tahrirlashda majburiy emas
  @IsOptional()
  @IsNumber({}, { message: "Foiz raqam bo'lishi kerak" })
  @Min(0, { message: "Foiz manfiy bo'lmasligi kerak" })
  percentage?: number;

  @IsOptional()
  @IsNumber({}, { message: "Oylik to'lov raqam bo'lishi kerak" })
  @Min(0, { message: "Oylik to'lov manfiy bo'lmasligi kerak" })
  monthlyPayment?: number;

  @IsOptional()
  @IsNumber({}, { message: "Umumiy narx raqam bo'lishi kerak" })
  @Min(0, { message: "Umumiy narx manfiy bo'lmasligi kerak" })
  totalPrice?: number;

  @IsOptional()
  @IsDateString({}, { message: "Shartnoma sanasi noto'g'ri formatda" })
  startDate?: Date;

  @IsOptional()
  @IsBoolean({ message: "Faolligi boolean bo'lishi kerak" })
  isActive?: boolean;

  @IsOptional()
  @IsArray({ message: "To'lovlar ro'yxati massiv bo'lishi kerak" })
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentItemDto)
  payments?: CreatePaymentItemDto[];
}

export class SellerCreateContractDto extends ContractDto {}

/**
 * Shartnoma tahrirlash uchun validatsiya DTO
 * Requirements: 9.1, 9.2, 9.3
 */
export class ValidateContractEditDto {
  @IsMongoId({ message: "Shartnoma ID noto'g'ri formatda" })
  @IsNotEmpty({ message: "Shartnoma ID bo'sh bo'lmasligi kerak" })
  contractId: string;

  @IsOptional()
  @IsNumber({}, { message: "Oylik to'lov raqam bo'lishi kerak" })
  @Min(0, { message: "Oylik to'lov manfiy bo'lmasligi kerak" })
  monthlyPayment?: number;

  @IsOptional()
  @IsNumber({}, { message: "Boshlang'ich to'lov raqam bo'lishi kerak" })
  @Min(0, { message: "Boshlang'ich to'lov manfiy bo'lmasligi kerak" })
  initialPayment?: number;

  @IsOptional()
  @IsNumber({}, { message: "Umumiy narx raqam bo'lishi kerak" })
  @Min(0, { message: "Umumiy narx manfiy bo'lmasligi kerak" })
  totalPrice?: number;
}

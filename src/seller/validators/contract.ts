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
import { Type } from "class-transformer";

class PaymentDto {
  @IsNumber({}, { message: "To'lov miqdori raqam bo'lishi kerak" })
  @Min(0, { message: "To'lov miqdori manfiy bo'lmasligi kerak" })
  amount: number;

  @IsDateString({}, { message: "Sana ISO formatda bo'lishi kerak" })
  date: string;

  @IsString({ message: "Izoh satr bo'lishi kerak" })
  @IsOptional()
  note?: string;
}

export class CreateContractDtoForSeller {
  [x: string]: any;

  @IsMongoId({ message: "Mijoz id noto'g'ri MongoId formatida bo'lishi kerak" })
  @IsNotEmpty({ message: "Mijoz id bo'sh bo'lmasligi kerak" })
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

  @IsNumber({}, { message: "Oldindan to'lov raqam bo'lishi kerak" })
  @Min(0, { message: "Oldindan to'lov manfiy bo'lmasligi kerak" })
  initialPayment: number;

  @IsNumber({}, { message: "Foiz raqam bo'lishi kerak" })
  @Min(0, { message: "Foiz manfiy bo'lmasligi kerak" })
  percentage: number;

  @IsNumber({}, { message: "Muddat raqam bo'lishi kerak" })
  @Min(1, { message: "Muddat kamida 1 oy bo'lishi kerak" })
  period: number;

  @IsNumber({}, { message: "Oylik to'lov raqam bo'lishi kerak" })
  @Min(0, { message: "Oylik to'lov manfiy bo'lmasligi kerak" })
  monthlyPayment: number;

  @IsNumber({}, { message: "Umumiy narx raqam bo'lishi kerak" })
  @Min(0, { message: "Umumiy narx manfiy bo'lmasligi kerak" })
  totalPrice: number;

  @IsString({ message: "Izoh satr bo'lishi kerak" })
  notes: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message:
        "Birinchi to'lov sanasi ISO formatda bo'lishi kerak (YYYY-MM-DD)",
    }
  )
  initialPaymentDueDate?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "Shartnoma sanasi ISO formatda bo'lishi kerak (YYYY-MM-DD)" }
  )
  startDate?: string;

  @IsOptional()
  @IsBoolean({ message: "Box boolean bo'lishi kerak" })
  box?: boolean;

  @IsOptional()
  @IsBoolean({ message: "Mbox boolean bo'lishi kerak" })
  mbox?: boolean;

  @IsOptional()
  @IsBoolean({ message: "Receipt boolean bo'lishi kerak" })
  receipt?: boolean;

  @IsOptional()
  @IsBoolean({ message: "iCloud boolean bo'lishi kerak" })
  iCloud?: boolean;

  @IsOptional()
  @IsArray({ message: "Payments array bo'lishi kerak" })
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?: PaymentDto[];
}

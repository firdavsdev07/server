import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsMongoId,
  IsNumber,
} from "class-validator";

class CustomerDto {
  @IsString({ message: "Mijoz ismi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Mijoz ismi bo'sh bo'lmasligi kerak" })
  fullName: string;

  @IsOptional()
  @IsString({ message: "Pasport seriya satr bo'lishi kerak" })
  passportSeries: string;

  @IsOptional()
  @IsString({ message: "Telefon raqam satr bo'lishi kerak" })
  phoneNumber: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "Tug'ilgan sana ISO formatda bo'lishi kerak (YYYY-MM-DD)" }
  )
  birthDate: Date;

  @IsOptional()
  @IsString({ message: "Manzil satr bo'lishi kerak" })
  address: string;
}

export class CreateCustomerDto extends CustomerDto {
  // @IsNumber()
  // @IsNotEmpty()
  // percent: number;

  @IsMongoId({ message: "Manager noto‘g‘ri MongoId formatida bo‘lishi kerak" })
  @IsNotEmpty({ message: "Manager bo'sh bo'lmasligi kerak" })
  managerId: string;
}

export class UpdateCustomerDto extends CreateCustomerDto {
  @IsString({ message: "Id satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Id bo'sh bo'lmasligi kerak" })
  @IsMongoId({ message: "Id noto‘g‘ri MongoId formatida bo‘lishi kerak" })
  id: string;

  @IsOptional()
  @IsBoolean({ message: "Faolligi boolean bo'lishi kerak" })
  @IsNotEmpty({ message: "Faolligi bo'sh bo'lmasligi kerak" })
  isActive: boolean;
}

export class SellerCreateCustomerDto extends CustomerDto {}

export class UpdateManagerDto {
  @IsString({ message: "Mijoz Id satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Mijoz Id bo'sh bo'lmasligi kerak" })
  @IsMongoId({ message: "Mijoz Id noto‘g‘ri MongoId formatida bo‘lishi kerak" })
  customerId: string;

  @IsString({ message: "Menejer Id satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Menejer Id bo'sh bo'lmasligi kerak" })
  @IsMongoId({
    message: "Menejer Id noto‘g‘ri MongoId formatida bo‘lishi kerak",
  })
  managerId: string;
}

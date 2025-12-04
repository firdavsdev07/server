import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
} from "class-validator";

export class CreateCustomerDtoForSeller {
  @IsString({ message: "Ism satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Ism bo'sh bo'lmasligi kerak" })
  firstName: string;

  @IsOptional()
  @IsString({ message: "Familiya satr bo'lishi kerak" })
  lastName: string;

  @IsOptional()
  @IsString({ message: "Telefon raqam satr bo'lishi kerak" })
  phoneNumber: string;

  @IsOptional()
  @IsString({ message: "Manzil satr bo'lishi kerak" })
  address: string;

  @IsOptional()
  @IsString({ message: "Pasport seriya satr bo'lishi kerak" })
  passportSeries: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "Tug'ilgan sana ISO formatda bo'lishi kerak (YYYY-MM-DD)" }
  )
  birthDate: Date;
}

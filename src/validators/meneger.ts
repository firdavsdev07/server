import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateMenegerDto {
  @IsString({ message: "Meneger ismi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Meneger ismi bo'sh bo'lmasligi kerak" })
  full_name: string;

  @IsString({ message: "RefId satr bo'lishi kerak" })
  @IsNotEmpty({ message: "RefId bo'sh bo'lmasligi kerak" })
  refId: string;

  @IsString({ message: "Telefon raqam satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Telefon raqam bo'sh bo'lmasligi kerak" })
  phone_number: string;
}

export class UpdateMenegerDto extends CreateMenegerDto {
  @IsString({ message: "Tavsiya satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Tavsiya bo'sh bo'lmasligi kerak" })
  @IsMongoId()
  managerId: string;
}

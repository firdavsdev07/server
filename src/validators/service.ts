import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateServiceDto {
  @IsString({ message: "Kurs nomi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Kurs nomi bo'sh bo'lmasligi kerak" })
  name: string;

  @IsOptional()
  @IsString({ message: "Kurs rasmi satr bo'lishi kerak" })
  image: string;

  @IsString({ message: "Kurs tavsifi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Kurs tavsifi bo'sh bo'lmasligi kerak" })
  description: string;

  @IsOptional()
  @IsNumber({}, { message: "Kurs narxi raqam bo'lishi kerak" })
  @Min(0, { message: "Kurs narxi manfiy bo'lmasligi kerak" })
  price: number;
}

export class UpdateServiceDto {
  @IsString({ message: "Kurs nomi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Kurs nomi bo'sh bo'lmasligi kerak" })
  name: string;

  @IsOptional()
  @IsString({ message: "Kurs rasmi satr bo'lishi kerak" })
  image: string;

  @IsString({ message: "Kurs tavsifi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Kurs tavsifi bo'sh bo'lmasligi kerak" })
  description: string;

  @IsOptional()
  @IsBoolean({ message: "Kurs faolligi boolean bo'lishi kerak" })
  @IsNotEmpty({ message: "Kurs faolligi bo'sh bo'lmasligi kerak" })
  isActive: boolean;

  @IsOptional()
  @IsNumber({}, { message: "Kurs narxi raqam bo'lishi kerak" })
  @Min(0, { message: "Kurs narxi manfiy bo'lmasligi kerak" })
  price: number;

  @IsString({ message: "Id satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Id bo'sh bo'lmasligi kerak" })
  @IsMongoId()
  serviceId: string;
}

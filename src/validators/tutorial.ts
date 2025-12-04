import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateTutorialDto {
  @IsString({ message: "Darslik nomi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Darslik nomi bo'sh bo'lmasligi kerak" })
  name: string;

  @IsOptional()
  @IsString({ message: "Darslik rasmi satr bo'lishi kerak" })
  image: string;

  @IsString({ message: "Darslik tavsifi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Darslik tavsifi bo'sh bo'lmasligi kerak" })
  description: string;

  @IsOptional()
  @IsNumber({}, { message: "Darslik narxi raqam bo'lishi kerak" })
  @Min(0, { message: "Darslik narxi manfiy bo'lmasligi kerak" })
  price?: number;
}

export class UpdateTutorialDto {
  @IsString({ message: "Darslik nomi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Darslik nomi bo'sh bo'lmasligi kerak" })
  name: string;

  @IsOptional()
  @IsString({ message: "Darslik rasmi satr bo'lishi kerak" })
  image: string;

  @IsString({ message: "Darslik tavsifi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Darslik tavsifi bo'sh bo'lmasligi kerak" })
  description: string;

  @IsOptional()
  @IsBoolean({ message: "Darslik faolligi boolean bo'lishi kerak" })
  @IsNotEmpty({ message: "Darslik faolligi bo'sh bo'lmasligi kerak" })
  isActive: boolean;

  @IsOptional()
  @IsNumber({}, { message: "Darslik narxi raqam bo'lishi kerak" })
  @Min(0, { message: "Darslik narxi manfiy bo'lmasligi kerak" })
  price?: number;

  @IsString({ message: "Tavsiya satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Tavsiya bo'sh bo'lmasligi kerak" })
  @IsMongoId()
  tutorialId: string;
}

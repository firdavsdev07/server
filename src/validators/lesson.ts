import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsMongoId,
  IsOptional,
} from "class-validator";

export class CreateLessonDto {
  @IsString({ message: "Dars nomi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Dars nomi bo'sh bo'lmasligi kerak" })
  name: string;

  @IsString({ message: "Video URL to'g'ri string formatida bo'lishi kerak" })
  @IsNotEmpty({ message: "Video URL bo'sh bo'lmasligi kerak" })
  videoUrl: string;

  @IsNumber({}, { message: "Davomiylik raqam bo'lishi kerak" })
  @IsPositive({ message: "Davomiylik musbat raqam bo'lishi kerak" })
  duration: number;

  @IsOptional()
  @IsString({ message: "Dars tavsifi satr bo'lishi kerak" })
  description: string;

  @IsString({ message: "Module id satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Modul IDsi bo'sh bo'lmasligi kerak" })
  @IsMongoId()
  moduleId: string;
}

export class UpdateLessonDto {
  @IsString({ message: "Dars nomi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Dars nomi bo'sh bo'lmasligi kerak" })
  name: string;

  @IsString({ message: "Video URL to'g'ri string formatida bo'lishi kerak" })
  @IsNotEmpty({ message: "Video URL bo'sh bo'lmasligi kerak" })
  videoUrl: string;

  @IsOptional()
  @IsNumber({}, { message: "Davomiylik raqam bo'lishi kerak" })
  @IsPositive({ message: "Davomiylik musbat raqam bo'lishi kerak" })
  duration: number;

  @IsOptional()
  @IsString({ message: "Dars tavsifi satr bo'lishi kerak" })
  description: string;

  @IsString({ message: "Module id satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Modul IDsi bo'sh bo'lmasligi kerak" })
  @IsMongoId()
  moduleId: string;
}

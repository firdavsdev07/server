import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  ArrayNotEmpty,
  IsMongoId,
} from "class-validator";
import { Types } from "mongoose";

export class CreateModuleDto {
  @IsString({ message: "Module turi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Module turi bo'sh bo'lmasligi kerak" })
  type: string;

  @IsString({ message: "Module nomi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Module nomi bo'sh bo'lmasligi kerak" })
  name: string;

  @IsString({ message: "Module tavsifi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Module tavsifi bo'sh bo'lmasligi kerak" })
  description: string;

  @IsString({ message: "Module satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Module bo'sh bo'lmasligi kerak" })
  @IsMongoId()
  courseId: Types.ObjectId;
}

export class UpdateModuleDto {
  @IsString({ message: "Module turi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Module turi bo'sh bo'lmasligi kerak" })
  type: string;

  @IsString({ message: "Module nomi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Module nomi bo'sh bo'lmasligi kerak" })
  name?: string;

  @IsString({ message: "Module tavsifi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Module tavsifi bo'sh bo'lmasligi kerak" })
  description?: string;

  @IsString({ message: "Module satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Module bo'sh bo'lmasligi kerak" })
  @IsMongoId()
  courseId: Types.ObjectId;
}

import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsString,
  ValidateNested,
  ArrayNotEmpty,
} from "class-validator";

import { Type } from "class-transformer";

export class CheckUserApprovedDto {
  @IsBoolean({ message: "User faolligi boolean bo'lishi kerak" })
  @IsNotEmpty({ message: "Useru faolligi bo'sh bo'lmasligi kerak" })
  isApproved: boolean;

  @IsString({ message: "User id satr bo'lishi kerak" })
  @IsNotEmpty({ message: "User id bo'sh bo'lmasligi kerak" })
  @IsMongoId()
  userId: string;
}

class CourseDto {
  @IsString({ message: "Kurs ID satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Kurs ID bo'sh bo'lmasligi kerak" })
  @IsMongoId({ message: "Kurs ID noto'g'ri formatda" })
  courseId: string;

  @IsBoolean({ message: "isPaid boolean bo'lishi kerak" })
  isPaid: boolean;
}

class TutorialDto {
  @IsString({ message: "Kurs ID satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Kurs ID bo'sh bo'lmasligi kerak" })
  @IsMongoId({ message: "Kurs ID noto'g'ri formatda" })
  tutorialId: string;

  @IsBoolean({ message: "isPaid boolean bo'lishi kerak" })
  isPaid: boolean;
}

export class AddUserCourseDto {
  @IsString({ message: "Foydalanuvchi ID satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Foydalanuvchi ID bo'sh bo'lmasligi kerak" })
  @IsMongoId({ message: "Foydalanuvchi ID noto'g'ri formatda" })
  userId: string;

  @Type(() => CourseDto)
  course: CourseDto;
}

export class AddUserTutorialDto {
  @IsString({ message: "Foydalanuvchi ID satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Foydalanuvchi ID bo'sh bo'lmasligi kerak" })
  @IsMongoId({ message: "Foydalanuvchi ID noto'g'ri formatda" })
  userId: string;

  @Type(() => TutorialDto)
  tutorial: TutorialDto;
}

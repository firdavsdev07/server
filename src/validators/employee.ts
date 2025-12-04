import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  IsMongoId,
  IsArray,
  IsOptional,
  IsBoolean,
} from "class-validator";
import { RoleEnum } from "../enums/role.enum";
import { Permission } from "../enums/permission.enum";

export class CreateEmployeeDto {
  @IsString({ message: "Xodim ismi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Xodim ismi bo'sh bo'lmasligi kerak" })
  firstName: string;

  @IsOptional()
  @IsString({ message: "Xodim familiyasi satr bo'lishi kerak" })
  lastName: string;

  @IsString({ message: "Telefon raqam satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Telefon raqam bo'sh bo'lmasligi kerak" })
  phoneNumber: string;

  @IsEnum(RoleEnum, {
    message: "Role noto‘g‘ri.",
  })
  role: RoleEnum;

  @IsOptional()
  @IsString({ message: "Parol satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Parol bo'sh bo'lmasligi kerak" })
  password: string;
}

export class UpdateEmployeeDto extends CreateEmployeeDto {
  @IsString({ message: "Id satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Id bo'sh bo'lmasligi kerak" })
  @IsMongoId({ message: "Id noto‘g‘ri MongoId formatida bo‘lishi kerak" })
  id: string;

  @IsOptional()
  @IsArray({ message: "Permissions massiv bo‘lishi kerak" })
  @IsEnum(Permission, {
    each: true,
    message: "Permissions faqat ruxsat etilgan turlardan bo‘lishi kerak",
  })
  permissions?: Permission[];

  @IsOptional()
  @IsBoolean({ message: "Faolligi boolean bo'lishi kerak" })
  @IsNotEmpty({ message: "Faolligi bo'sh bo'lmasligi kerak" })
  isActive: boolean;
}

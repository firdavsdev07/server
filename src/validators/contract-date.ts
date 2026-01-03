import { IsDate, IsNotEmpty, IsString, IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class UpdateContractDateDto {
  @IsNotEmpty({ message: "Contract ID majburiy" })
  @IsString({ message: "Contract ID string bo'lishi kerak" })
  contractId!: string;

  @IsNotEmpty({ message: "Yangi boshlanish sanasi majburiy" })
  @Type(() => Date)
  @IsDate({ message: "To'g'ri sana kiriting" })
  newStartDate!: Date;

  @IsOptional()
  @IsString({ message: "Sabab string bo'lishi kerak" })
  reason?: string;
}

export class PreviewDateChangeDto {
  @IsNotEmpty({ message: "Contract ID majburiy" })
  @IsString({ message: "Contract ID string bo'lishi kerak" })
  contractId!: string;

  @IsNotEmpty({ message: "Yangi boshlanish sanasi majburiy" })
  @Type(() => Date)
  @IsDate({ message: "To'g'ri sana kiriting" })
  newStartDate!: Date;
}

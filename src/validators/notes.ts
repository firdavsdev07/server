import { IsString, IsNotEmpty, IsMongoId, IsOptional } from "class-validator";

export class NotesDto {
  @IsMongoId({ message: "Mijoz ID noto'g'ri" })
  @IsNotEmpty({ message: "Mijoz ID bo'sh bo'lmasligi kerak" })
  customerId: string;
  
  @IsString({ message: "Izoh matn bo'lishi kerak" })
  @IsOptional()
  notes?: string;
}

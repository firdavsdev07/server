import {
  IsDate,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from "class-validator";

const PHONECODES = "90|91|93|94|95|97|98|99|88";

export class LoginDto {
  @IsString({ message: "Telefon raqami satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Telefon raqami bo'sh bo'lmasligi kerak" })
  @Matches(new RegExp(`^\\+998(${PHONECODES})\\d{7}$`), {
    message:
      "Telefon raqami +998-XX-YYY-YY-YY formatida boʻlishi kerak, bunda amaldagi operator kodlari va raqamlariga mos kelmaydi",
  })
  phoneNumber: string;

  @IsString()
  @IsNotEmpty({ message: "Parolni kiriting!" })
  password: string;
}

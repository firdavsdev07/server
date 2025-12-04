import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateChannelDto {
  @IsString({ message: "Kanal nomi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Kanal nomi bo'sh bo'lmasligi kerak" })
  name: string;

  @IsString({ message: "Kanal kategoriyasi satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Kanal kategoriyasi bo'sh bo'lmasligi kerak" })
  category: string;

  @IsNumber({}, { message: "Asosiy narx raqam bo'lishi kerak" })
  @Min(0, { message: "Asosiy narx manfiy bo'lmasligi kerak" })
  originalPrice: number;

  @IsNumber({}, { message: "Chegirma narxi raqam bo'lishi kerak" })
  @Min(0, { message: "Chegirma narxi manfiy bo'lmasligi kerak" })
  discountPrice: number;

  @IsBoolean({ message: "Monetizatsiya boolean bo'lishi kerak" })
  isMonetized: boolean;

  @IsNumber({}, { message: "Obunachilar soni raqam bo'lishi kerak" })
  @Min(0, { message: "Obunachilar soni manfiy bo'lmasligi kerak" })
  subscribers: number;

  @IsOptional()
  @IsBoolean({ message: "Kafolat xizmati boolean bo'lishi kerak" })
  guaranteeService: boolean;

  @IsArray({ message: "Rasmlar ro'yxati bo'lishi kerak" })
  @IsString({ each: true, message: "Rasmlar satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Rasmlar ro'yxati bo'sh bo'lmasligi kerak" })
  images: string[];

  @IsOptional()
  @IsBoolean({ message: "Kanal faolligi boolean bo'lishi kerak" })
  isActive: boolean;
}

export class UpdateChannelDto {
  @IsOptional()
  @IsString({ message: "Kanal nomi satr bo'lishi kerak" })
  name: string;

  @IsOptional()
  @IsString({ message: "Kanal kategoriyasi satr bo'lishi kerak" })
  category: string;

  @IsOptional()
  @IsNumber({}, { message: "Asosiy narx raqam bo'lishi kerak" })
  @Min(0, { message: "Asosiy narx manfiy bo'lmasligi kerak" })
  originalPrice: number;

  @IsOptional()
  @IsNumber({}, { message: "Chegirma narxi raqam bo'lishi kerak" })
  @Min(0, { message: "Chegirma narxi manfiy bo'lmasligi kerak" })
  discountPrice: number;

  @IsOptional()
  @IsBoolean({ message: "Monetizatsiya boolean bo'lishi kerak" })
  isMonetized: boolean;

  @IsOptional()
  @IsNumber({}, { message: "Obunachilar soni raqam bo'lishi kerak" })
  @Min(0, { message: "Obunachilar soni manfiy bo'lmasligi kerak" })
  subscribers: number;

  @IsOptional()
  @IsBoolean({ message: "Kafolat xizmati boolean bo'lishi kerak" })
  guaranteeService: boolean;

  @IsOptional()
  @IsArray({ message: "Rasmlar ro'yxati bo'lishi kerak" })
  @IsString({ each: true, message: "Rasmlar satr bo'lishi kerak" })
  images: string[];

  @IsOptional()
  @IsBoolean({ message: "Kanal faolligi boolean bo'lishi kerak" })
  isActive: boolean;

  @IsString({ message: "Id satr bo'lishi kerak" })
  @IsNotEmpty({ message: "Id bo'sh bo'lmasligi kerak" })
  @IsMongoId()
  channelId: string;
}

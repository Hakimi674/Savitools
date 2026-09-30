import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";

export class HomeDomainQueryDto {
  @ApiProperty({
    example: "example.com",
    description: "Claimed issuer home domain",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  @Matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}\.?$/)
  domain: string;

  @ApiProperty({
    example: "GDJ47UQJNT6UOMV3CLNZ43XGDKOUM3UHV7V3FF3W4KMIRRNICNSS2N2H",
    description: "Stellar issuer public key",
  })
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/)
  issuer: string;
}

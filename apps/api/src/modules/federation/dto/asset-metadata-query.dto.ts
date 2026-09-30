import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";

export class AssetMetadataQueryDto {
  @ApiProperty({
    example: "example.com",
    description: "Asset issuer home domain",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  @Matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}\.?$/)
  domain: string;

  @ApiProperty({ example: "USDC", description: "Stellar asset code" })
  @IsString()
  @Matches(/^[a-zA-Z0-9]{1,12}$/)
  code: string;

  @ApiProperty({
    example: "GDJ47UQJNT6UOMV3CLNZ43XGDKOUM3UHV7V3FF3W4KMIRRNICNSS2N2H",
    description: "Stellar issuer public key",
  })
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/)
  issuer: string;
}

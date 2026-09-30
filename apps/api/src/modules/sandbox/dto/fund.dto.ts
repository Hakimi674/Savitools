import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FundDto {
  @ApiProperty({ description: 'Stellar public key' })
  @IsString()
  @IsNotEmpty()
  publicKey!: string;

  @ApiPropertyOptional({ description: 'Target network (e.g. testnet, quickstart)' })
  @IsOptional()
  @IsString()
  network?: string;
}

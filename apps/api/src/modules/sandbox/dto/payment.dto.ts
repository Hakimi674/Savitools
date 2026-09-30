import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  STELLAR_DESTINATION_MESSAGE,
  STELLAR_DESTINATION_PATTERN,
} from '../../stellar/address';

export class PaymentDto {
  @ApiProperty({ description: 'Secret key of source account' })
  @IsString()
  @IsNotEmpty()
  fromSecret!: string;

  @ApiProperty({ description: 'Destination Stellar address (G… or M…)' })
  @IsString()
  @IsNotEmpty()
  @Matches(STELLAR_DESTINATION_PATTERN, {
    message: STELLAR_DESTINATION_MESSAGE,
  })
  toPublicKey!: string;

  @ApiProperty({ description: 'Asset to send ("XLM" or "CODE:ISSUER")' })
  @IsString()
  @IsNotEmpty()
  asset!: string;

  @ApiProperty({ description: 'Amount to send' })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiPropertyOptional({ description: 'Optional transaction memo' })
  @IsString()
  @IsOptional()
  memo?: string;

  @ApiPropertyOptional({ description: 'Target network (e.g. testnet, quickstart)' })
  @IsOptional()
  @IsString()
  network?: string;
}

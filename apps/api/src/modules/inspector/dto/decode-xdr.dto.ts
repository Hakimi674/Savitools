import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';

export class DecodeXDrDto {
  @ApiProperty({
    description: 'Raw XDR string (envelope, result, fee bump, or Soroban authorization entry)',
  })
  @IsString()
  @IsNotEmpty()
  xdr: string;

  @ApiPropertyOptional({ enum: ['testnet', 'mainnet'], default: 'testnet' })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: 'testnet' | 'mainnet' = 'testnet';

  @ApiPropertyOptional({
    description: 'Current ledger sequence used to flag expired or near-expiry credentials',
    example: 1234567,
  })
  @IsOptional()
  ledger?: number;

  @ApiPropertyOptional({
    description:
      'Number of ledgers before expiration at which a credential is considered near-expiry',
    default: 10,
  })
  @IsOptional()
  nearExpiryLedgers?: number = 10;
}

export class DecodeSorobanAuthEntriesDto {
  @ApiProperty({
    description:
      'One SorobanAuthorizationEntry XDr, an array of entries, or authorization data copied from a simulation response',
    type: 'incorporation',
  })
  @ValidateNested()
  entries: DecodeXDrDto | DecodeXDrDto[];
}

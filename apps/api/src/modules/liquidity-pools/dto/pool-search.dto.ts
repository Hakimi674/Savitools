import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class PoolSearchDto {
  @ApiProperty({
    description: 'First asset in the pair. Use "XLM" for native or "CODE:ISSUER" for non-native.',
    example: 'XLM',
  })
  @IsString()
  @IsNotEmpty()
  assetA!: string;

  @ApiProperty({
    description: 'Second asset in the pair. Use "XLM" for native or "CODE:ISSUER" for non-native.',
    example: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  })
  @IsString()
  @IsNotEmpty()
  assetB!: string;

  @ApiPropertyOptional({
    enum: ['mainnet', 'testnet'],
    default: 'testnet',
    description: 'Stellar network to query (default: testnet).',
  })
  @IsOptional()
  @IsIn(['mainnet', 'testnet'], { message: 'network must be "mainnet" or "testnet"' })
  network?: 'mainnet' | 'testnet';
}

export class ShareValueDto {
  @ApiProperty({
    description: 'Horizon pool ID (hex, 64 chars).',
    example: 'a468d41d61e...',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{64}$/, { message: 'poolId must be a 64-character hex string' })
  poolId!: string;

  @ApiProperty({
    description: 'Number of LP shares to calculate value for.',
    example: '100.0000000',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,7})?$/, {
    message: 'shares must be a positive decimal with at most 15 integer and 7 fractional digits',
  })
  shares!: string;

  @ApiPropertyOptional({
    enum: ['mainnet', 'testnet'],
    default: 'testnet',
    description: 'Stellar network to query (default: testnet).',
  })
  @IsOptional()
  @IsIn(['mainnet', 'testnet'], { message: 'network must be "mainnet" or "testnet"' })
  network?: 'mainnet' | 'testnet';
}

export class WatchPoolDto {
  @ApiProperty({
    description: 'Horizon pool ID (hex, 64 chars).',
    example: 'a468d41d61e...',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{64}$/, { message: 'poolId must be a 64-character hex string' })
  poolId!: string;

  @ApiProperty({
    description: 'First asset in the pair.',
    example: 'XLM',
  })
  @IsString()
  @IsNotEmpty()
  assetA!: string;

  @ApiProperty({
    description: 'Second asset in the pair.',
    example: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  })
  @IsString()
  @IsNotEmpty()
  assetB!: string;

  @ApiPropertyOptional({
    description: 'Optional label for the watched pool.',
    example: 'My XLM/USDC Pool',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    enum: ['mainnet', 'testnet'],
    default: 'testnet',
    description: 'Stellar network (default: testnet).',
  })
  @IsOptional()
  @IsIn(['mainnet', 'testnet'], { message: 'network must be "mainnet" or "testnet"' })
  network?: 'mainnet' | 'testnet';
}

export class UnwatchPoolDto {
  @ApiProperty({
    description: 'Watched pool ID to remove.',
    example: 'uuid',
  })
  @IsString()
  @IsNotEmpty()
  id!: string;
}

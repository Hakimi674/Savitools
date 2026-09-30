import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsNumber, IsOptional, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TransactionPlanDto {
  @ApiProperty({
    description: 'Transaction identifier or label',
    example: 'payment-1'
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Source account address',
    example: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU'
  })
  @IsString()
  @IsNotEmpty()
  sourceAccount: string;

  @ApiProperty({
    description: 'Planned sequence number for this transaction',
    example: 12345,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sequenceNumber?: number;

  @ApiProperty({
    description: 'Transaction description',
    example: 'Payment of 100 XLM to recipient',
    required: false
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Transaction dependencies (IDs of transactions that must complete first)',
    example: ['setup-trustline'],
    required: false
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];
}

export class SequencePlanRequestDto {
  @ApiProperty({
    description: 'Array of planned transactions',
    type: [TransactionPlanDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionPlanDto)
  transactions: TransactionPlanDto[];

  @ApiProperty({
    description: 'Network to use (testnet or mainnet)',
    enum: ['testnet', 'mainnet'],
    default: 'testnet',
    required: false
  })
  @IsOptional()
  @IsString()
  network?: 'testnet' | 'mainnet' = 'testnet';
}

export class AccountSequenceDto {
  @ApiProperty({
    description: 'Stellar account address',
    example: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU'
  })
  @IsString()
  @IsNotEmpty()
  account: string;

  @ApiProperty({
    description: 'Network to query (testnet or mainnet)',
    enum: ['testnet', 'mainnet'],
    default: 'testnet',
    required: false
  })
  @IsOptional()
  @IsString()
  network?: 'testnet' | 'mainnet' = 'testnet';
}

export class ValidateSequenceDto {
  @ApiProperty({
    description: 'Account address to validate',
    example: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU'
  })
  @IsString()
  @IsNotEmpty()
  account: string;

  @ApiProperty({
    description: 'Proposed sequence number',
    example: 12345
  })
  @IsNumber()
  @Min(0)
  proposedSequence: number;

  @ApiProperty({
    description: 'Network to validate against',
    enum: ['testnet', 'mainnet'],
    default: 'testnet',
    required: false
  })
  @IsOptional()
  @IsString()
  network?: 'testnet' | 'mainnet' = 'testnet';
}

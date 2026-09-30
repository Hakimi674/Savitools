import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StorageCompareDto {
  @ApiProperty({
    description: 'Contract ID to compare storage for',
    example: 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K'
  })
  @IsString()
  @IsNotEmpty()
  contractId: string;

  @ApiProperty({
    description: 'Storage key to compare',
    example: 'AAAABAAAABBjb3VudGVy'
  })
  @IsString()
  @IsNotEmpty()
  storageKey: string;

  @ApiProperty({
    description: 'First ledger sequence to compare',
    example: 1000
  })
  @IsNumber()
  @Min(1)
  ledgerSeq1: number;

  @ApiProperty({
    description: 'Second ledger sequence to compare',
    example: 1100
  })
  @IsNumber()
  @Min(1)
  ledgerSeq2: number;

  @ApiPropertyOptional({
    description: 'Network to query',
    example: 'testnet'
  })
  @IsOptional()
  @IsString()
  network?: string = 'testnet';

  @ApiPropertyOptional({
    description: 'Custom RPC endpoint URL',
    example: 'https://soroban-testnet.stellar.org'
  })
  @IsOptional()
  @IsString()
  rpcEndpoint?: string;
}
import { IsString, IsOptional, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StorageQueryDto {
  @ApiProperty({
    description: 'Contract ID to query storage for',
    example: 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K'
  })
  @IsString()
  @IsNotEmpty()
  contractId: string;

  @ApiProperty({
    description: 'Storage key in XDR format or typed format',
    example: 'AAAABAAAABBjb3VudGVy' // base64 XDR
  })
  @IsString()
  @IsNotEmpty()
  storageKey: string;

  @ApiProperty({
    description: 'Durability class of the storage entry',
    enum: ['temporary', 'persistent', 'instance'],
    example: 'persistent'
  })
  @IsIn(['temporary', 'persistent', 'instance'])
  durability: 'temporary' | 'persistent' | 'instance';

  @ApiPropertyOptional({
    description: 'Network to query (defaults to testnet)',
    enum: ['testnet', 'mainnet'],
    example: 'testnet'
  })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: 'testnet' | 'mainnet' = 'testnet';

  @ApiPropertyOptional({
    description: 'Custom RPC endpoint URL',
    example: 'https://soroban-testnet.stellar.org'
  })
  @IsOptional()
  @IsString()
  rpcEndpoint?: string;
}
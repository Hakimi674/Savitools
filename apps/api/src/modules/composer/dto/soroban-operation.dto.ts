import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator';

export interface ScValArgumentDto {
  type: 'Address' | 'Bool' | 'Bytes' | 'I32' | 'I64' | 'I128' | 'I256' | 'String' | 'Symbol' | 'U32' | 'U64' | 'U128' | 'U256' | 'Vec' | 'Map';
  value: any;
}

export class InvokeHostFunctionDto {
  @ApiProperty({ example: 'invoke_host_function' })
  @IsString()
  type: 'invoke_host_function';

  @ApiProperty({ description: 'Contract ID (C...)', example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4' })
  @IsString()
  contractId: string;

  @ApiProperty({ description: 'Function name to invoke', example: 'transfer' })
  @IsString()
  functionName: string;

  @ApiPropertyOptional({ description: 'Function arguments as ScVal array', type: 'array', items: { type: 'object' } })
  @IsOptional()
  @IsArray()
  arguments?: any[];

  @ApiPropertyOptional({ description: 'Use ABI validation if available', default: true })
  @IsOptional()
  @IsBoolean()
  useAbi?: boolean;

  @ApiPropertyOptional({ description: 'Use raw ScVal mode (bypass ABI)', default: false })
  @IsOptional()
  @IsBoolean()
  rawMode?: boolean;

  @ApiPropertyOptional({ description: 'Resource fee in stroops (for Soroban resource consumption)' })
  @IsOptional()
  @IsString()
  resourceFee?: string;

  @ApiPropertyOptional({ description: 'WASM ID for ABI lookup (optional)' })
  @IsOptional()
  @IsString()
  wasmId?: string;
}

export interface SorobanResourceFees {
  cpuInstructions: string;
  readBytes: string;
  writeBytes: string;
  readLedgerEntries: string;
  writeLedgerEntries: string;
  transactionSizeFee: string;
}

export interface SorobanSimulationResult {
  success: boolean;
  hash: string;
  fee: string | null;
  resourceFee: SorobanResourceFees | null;
  resultCodes: string | null;
  operationResults: unknown | null;
  ledger: number | null;
  returnValue?: any;
  events?: any[];
}

/**
 * Supported ScVal types for the Composer
 */
export const SUPPORTED_SCVAL_TYPES = [
  'Address',
  'Bool', 
  'Bytes',
  'I32',
  'I64',
  'I128',
  'I256',
  'String',
  'Symbol',
  'U32',
  'U64',
  'U128',
  'U256',
  'Vec',
  'Map',
] as const;

export type SupportedScValType = typeof SUPPORTED_SCVAL_TYPES[number];
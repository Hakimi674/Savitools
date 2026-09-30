import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { listRpcMethods } from '../soroban-rpc.methods';

export type SorobanRpcNetwork = 'testnet' | 'mainnet';

/** Kept in sync with `SOROBAN_RPC_METHODS` so Swagger shows the real menu. */
const METHOD_NAMES = listRpcMethods().map((method) => method.name);

export class ExecuteSorobanRpcDto {
  @ApiProperty({
    description:
      'Whitelisted read-only Soroban RPC method to invoke. Write methods such as sendTransaction are not exposed by the console.',
    enum: METHOD_NAMES,
    example: METHOD_NAMES[0],
  })
  @IsString()
  method!: string;

  @ApiPropertyOptional({
    description: 'Named parameters, validated against the method schema.',
    type: 'object',
    additionalProperties: true,
    example: {},
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Network whose configured RPC endpoint receives the call.',
    enum: ['testnet', 'mainnet'],
    default: 'testnet',
  })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: SorobanRpcNetwork;
}

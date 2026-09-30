import { IsString, IsOptional, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TypedKeyDto {
  @ApiProperty({
    description: 'Key type for typed storage key creation',
    enum: ['symbol', 'string', 'address', 'instance', 'u32', 'i32', 'u64', 'i64', 'bytes'],
    example: 'symbol'
  })
  @IsIn(['symbol', 'string', 'address', 'instance', 'u32', 'i32', 'u64', 'i64', 'bytes'])
  keyType: 'symbol' | 'string' | 'address' | 'instance' | 'u32' | 'i32' | 'u64' | 'i64' | 'bytes';

  @ApiProperty({
    description: 'Key value in the appropriate format for the key type',
    example: 'counter'
  })
  @IsString()
  @IsNotEmpty()
  keyValue: string;

  @ApiPropertyOptional({
    description: 'Additional key components for composite keys (JSON array)',
    example: '["user", "GXXXXXXX"]'
  })
  @IsOptional()
  @IsString()
  additionalKeys?: string;
}
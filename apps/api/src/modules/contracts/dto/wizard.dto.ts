import { IsString, IsOptional, IsIn, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeployWizardDto {
  @ApiProperty({
    description: 'Deployment wizard step: 1 (upload), 2 (configure), 3 (deploy)',
    enum: [1, 2, 3],
  })
  @IsNumber()
  @IsIn([1, 2, 3])
  step!: number;

  @ApiPropertyOptional({
    description: 'Step token provided by the previous step to enforce sequential execution',
  })
  @IsOptional()
  @IsString()
  stepToken?: string;

  @ApiPropertyOptional({
    description: 'Step 1: Base64 or raw string representation of WASM file, or uploaded file data',
  })
  @IsOptional()
  @IsString()
  wasmBase64?: string;

  @ApiPropertyOptional({
    description: 'Step 2: Admin address',
  })
  @IsOptional()
  @IsString()
  admin?: string;

  @ApiPropertyOptional({
    description: 'Step 2: Custom salt for contract address precomputation',
  })
  @IsOptional()
  @IsString()
  salt?: string;

  @ApiPropertyOptional({
    description: 'Step 2: Constructor arguments as a JSON array string or array',
  })
  @IsOptional()
  args?: string | unknown[];

  @ApiPropertyOptional({
    description: 'Network to deploy to',
    enum: ['testnet'],
    default: 'testnet',
  })
  @IsOptional()
  @IsString()
  @IsIn(['testnet'])
  network?: string;
}

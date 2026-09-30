import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidateChallengeDto {
  @ApiProperty({
    description: 'Challenge transaction XDR',
    example: 'AAAAAgAAAAD...'
  })
  @IsString()
  challengeXdr: string;

  @ApiProperty({
    description: 'Server public key for signature validation',
    example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
  })
  @IsString()
  serverAccountId: string;

  @ApiProperty({
    description: 'Client account public key',
    example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
  })
  @IsString()
  clientAccountId: string;

  @ApiPropertyOptional({
    description: 'Network to validate against',
    example: 'testnet',
    enum: ['testnet', 'mainnet']
  })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: 'testnet' | 'mainnet' = 'testnet';

  @ApiPropertyOptional({
    description: 'Expected home domain',
    example: 'anchor.example.com'
  })
  @IsOptional()
  @IsString()
  homeDomain?: string;

  @ApiPropertyOptional({
    description: 'Expected web auth domain',
    example: 'anchor.example.com'
  })
  @IsOptional()
  @IsString()
  webAuthDomain?: string;
}
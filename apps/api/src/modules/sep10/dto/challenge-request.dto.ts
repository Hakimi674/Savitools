import { IsString, IsOptional, IsUrl, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChallengeRequestDto {
  @ApiProperty({
    description: 'Anchor domain to fetch challenge from',
    example: 'https://anchor.example.com'
  })
  @IsUrl({}, { message: 'Domain must be a valid URL' })
  domain: string;

  @ApiProperty({
    description: 'Client account public key',
    example: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
  })
  @IsString()
  account: string;

  @ApiPropertyOptional({
    description: 'Network to use for validation',
    example: 'testnet',
    enum: ['testnet', 'mainnet']
  })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: 'testnet' | 'mainnet' = 'testnet';

  @ApiPropertyOptional({
    description: 'Home domain for client domain signing',
    example: 'client.example.com'
  })
  @IsOptional()
  @IsString()
  homeDomain?: string;

  @ApiPropertyOptional({
    description: 'Client domain for client domain signing',
    example: 'wallet.example.com'
  })
  @IsOptional()
  @IsString()
  clientDomain?: string;
}
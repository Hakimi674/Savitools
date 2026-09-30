import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNetworkProfileDto {
  @ApiProperty({ example: 'Testnet local', description: 'Human-readable profile name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'https://horizon-testnet.stellar.org',
    description: 'Horizon base URL the profile points at',
  })
  @IsString()
  @IsNotEmpty()
  horizonUrl!: string;

  @ApiProperty({
    example: 'Test SDF Network ; September 2015',
    description: 'Expected Stellar network passphrase for the Horizon endpoint',
  })
  @IsString()
  @IsNotEmpty()
  networkPassphrase!: string;

  @ApiPropertyOptional({
    example: 'https://friendbot.stellar.org',
    description: 'Optional Friendbot URL used to fund accounts on this network',
  })
  @IsOptional()
  @IsString()
  friendbotUrl?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Mark this profile as the startup default',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

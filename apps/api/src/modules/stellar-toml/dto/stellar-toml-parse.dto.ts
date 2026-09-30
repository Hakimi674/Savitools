import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class StellarTomlParseDto {
  @ApiProperty({
    description: 'The stellar.toml content to parse and validate',
    example: `VERSION="2.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
FEDERATION_SERVER="https://api.domain.com/federation"
AUTH_SERVER="https://api.domain.com/auth"
TRANSFER_SERVER="https://api.domain.com/transfer"
KYC_SERVER="https://api.domain.com/kyc"

[[CURRENCIES]]
code="USD"
issuer="GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU"
display_decimals=2
name="US Dollar"
desc="United States Dollar"`
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'Whether to perform strict validation according to SEP-1 standards',
    default: true,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  strict?: boolean = true;
}

export class StellarTomlFormatDto {
  @ApiProperty({
    description: 'The stellar.toml content to format',
    example: `VERSION="2.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"`
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'Indentation style for formatting',
    enum: ['spaces', 'tabs'],
    default: 'spaces',
    required: false
  })
  @IsOptional()
  @IsString()
  indent?: 'spaces' | 'tabs' = 'spaces';

  @ApiProperty({
    description: 'Number of spaces for indentation (when indent is "spaces")',
    default: 2,
    required: false
  })
  @IsOptional()
  indentSize?: number = 2;
}

export class StellarTomlValidateDto {
  @ApiProperty({
    description: 'The stellar.toml content to validate against SEP-1',
    example: `VERSION="2.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"`
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'Validation level - "basic" or "strict"',
    enum: ['basic', 'strict'],
    default: 'basic',
    required: false
  })
  @IsOptional()
  @IsString()
  level?: 'basic' | 'strict' = 'basic';

  @ApiProperty({
    description: 'Network to validate against (testnet or mainnet)',
    enum: ['testnet', 'mainnet'],
    default: 'testnet',
    required: false
  })
  @IsOptional()
  @IsString()
  network?: 'testnet' | 'mainnet' = 'testnet';
}
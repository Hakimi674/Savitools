import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyNetworkPassphraseDto {
  @ApiProperty({
    example: 'https://horizon-testnet.stellar.org',
    description: 'Horizon base URL to read the network passphrase from',
  })
  @IsString()
  @IsNotEmpty()
  horizonUrl!: string;

  @ApiPropertyOptional({
    example: 'Test SDF Network ; September 2015',
    description: 'Passphrase to compare the Horizon endpoint against',
  })
  @IsOptional()
  @IsString()
  expectedPassphrase?: string;
}

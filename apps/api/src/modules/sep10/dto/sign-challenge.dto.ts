import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SignChallengeDto {
  @ApiProperty({
    description: 'Challenge transaction XDR to sign',
    example: 'AAAAAgAAAAD...'
  })
  @IsString()
  challengeXdr: string;

  @ApiProperty({
    description: 'Client account keypair for signing (will be redacted from logs)',
    example: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
  })
  @IsString()
  clientKeypair: string;

  @ApiPropertyOptional({
    description: 'Additional keypair for client domain signing',
    example: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
  })
  @IsOptional()
  @IsString()
  clientDomainKeypair?: string;
}
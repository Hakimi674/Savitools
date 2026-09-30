import { IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TokenExchangeDto {
  @ApiProperty({
    description: 'Signed challenge transaction XDR',
    example: 'AAAAAgAAAAD...'
  })
  @IsString()
  signedChallengeXdr: string;

  @ApiProperty({
    description: 'Anchor domain for token exchange',
    example: 'https://anchor.example.com'
  })
  @IsUrl({}, { message: 'Domain must be a valid URL' })
  domain: string;
}
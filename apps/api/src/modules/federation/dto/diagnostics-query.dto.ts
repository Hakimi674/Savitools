import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DiagnosticsQueryDto {
  @ApiProperty({
    description: 'Anchor domain whose federation server is diagnosed',
    example: 'stellar.org',
  })
  @IsString()
  @IsNotEmpty()
  domain!: string;
}

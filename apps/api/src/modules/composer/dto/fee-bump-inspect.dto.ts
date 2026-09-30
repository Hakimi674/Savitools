import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class FeeBumpInspectDto {
  @ApiProperty({
    description: 'Base64 XDR of a classic or fee-bump transaction envelope',
    example: 'AAAAAgAAA...',
  })
  @IsString()
  innerXdr: string;
}

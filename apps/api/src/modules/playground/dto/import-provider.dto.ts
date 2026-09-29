import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsObject, MinLength } from 'class-validator';

export class ImportProviderDto {
  @ApiProperty({ description: 'Name/label for the provider' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ description: 'OpenAPI JSON document' })
  @IsObject()
  openApiJson!: unknown;

  @ApiProperty({ description: 'HTTPS server origin for the provider' })
  @IsString()
  origin!: string;

  @ApiProperty({ description: 'Raw API key (will be encrypted at rest)' })
  @IsString()
  @MinLength(1)
  apiKey!: string;
}

export class RenameProviderDto {
  @ApiProperty({ description: 'New name/label for the provider' })
  @IsString()
  @MinLength(1)
  name!: string;
}
import { IsString, IsOptional, IsHexadecimal, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadWasmDto {
  @ApiPropertyOptional({
    description: 'Expected SHA-256 checksum (hex) of the uploaded file for integrity verification',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  @IsOptional()
  @IsString()
  @IsHexadecimal()
  @Length(64, 64)
  checksum?: string;

  @ApiPropertyOptional({
    description: 'Optional Git repository URL to clone and pin a .wasm artifact from',
    example: 'https://github.com/example/contract-repo.git',
  })
  @IsOptional()
  @IsString()
  gitRepoUrl?: string;

  @ApiPropertyOptional({
    description: 'Optional path within the Git repository to the .wasm build artifact',
    example: 'target/wasm32-unknown-unknown/release/contract.wasm',
  })
  @IsOptional()
  @IsString()
  gitArtifactPath?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SignatureDto {
  @ApiProperty({ description: 'Signer public key' })
  @IsString()
  publicKey: string;

  @ApiProperty({ description: 'Signature in hex format' })
  @IsString()
  signature: string;

  @ApiPropertyOptional({ description: 'Hint for signature verification' })
  @IsOptional()
  @IsString()
  hint?: string;
}

export class PartialSignatureDto {
  @ApiProperty({ description: 'Transaction XDR to sign' })
  @IsString()
  xdr: string;

  @ApiPropertyOptional({ description: 'Network (testnet or mainnet)', enum: ['testnet', 'mainnet'] })
  @IsOptional()
  @IsString()
  network?: 'testnet' | 'mainnet';

  @ApiProperty({ description: 'Array of signatures to add', type: [SignatureDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignatureDto)
  signatures: SignatureDto[];
}

export class PartialSignatureResponse {
  @ApiProperty({ description: 'Updated transaction XDR with new signatures' })
  xdr: string;

  @ApiProperty({ description: 'Current signature count' })
  currentSignatures: number;

  @ApiProperty({ description: 'Required signatures for each threshold' })
  requiredSignatures: {
    low: number;
    medium: number;
    high: number;
  };

  @ApiProperty({ description: 'Whether transaction meets signing requirements' })
  readyToSubmit: {
    low: boolean;
    medium: boolean;
    high: boolean;
  };

  @ApiProperty({ description: 'List of current signers' })
  signers: Array<{
    publicKey: string;
    weight: number;
    hasSigned: boolean;
  }>;
}
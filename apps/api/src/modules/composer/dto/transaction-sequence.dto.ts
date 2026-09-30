import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class OperationInputDto {
  @IsString()
  type: string;

  [key: string]: any;
}

export class SourceReferenceDto {
  @IsInt()
  @Min(0)
  step: number;

  @IsOptional()
  @IsIn(['source', 'destination'])
  field?: 'source' | 'destination';
}

export class TransactionStepInputDto {
  source: any;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperationInputDto)
  operations: OperationInputDto[];

  @IsOptional()
  @IsString()
  memo?: string;
}

export class RunTransactionSequenceDto {
  @IsIn(['testnet', 'mainnet'])
  network: 'testnet' | 'mainnet';

  @IsBoolean()
  stopOnFailure: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionStepInputDto)
  steps: TransactionStepInputDto[];
}

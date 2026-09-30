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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- operation fields are arbitrary JSON keyed by field name
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- either an account string or a {step, field} reference
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

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_EVENT_FILTER_CRITERIA,
  MAX_EVENT_FILTER_VALUE_LENGTH,
} from '../event-filters';

export const FILTER_MAX_EVENTS = 1000;

export const EVENT_FILTER_KINDS = [
  'topic_contains',
  'value_type_is',
  'value_equals',
  'ledger_range',
] as const;

export class EventFilterCriterionDto {
  @ApiProperty({ enum: EVENT_FILTER_KINDS })
  @IsIn(EVENT_FILTER_KINDS)
  kind!: (typeof EVENT_FILTER_KINDS)[number];

  @ApiPropertyOptional({ description: 'Required for every kind except ledger_range.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_EVENT_FILTER_VALUE_LENGTH)
  value?: string;

  @ApiPropertyOptional({ description: 'Inclusive lower bound, ledger_range only.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  from?: number;

  @ApiPropertyOptional({ description: 'Inclusive upper bound, ledger_range only.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  to?: number;
}

export class FilterEventsDto {
  @ApiProperty({
    description: 'Decoded events, as returned by GET /contracts/events.',
    type: 'array',
    items: { type: 'object' },
  })
  @IsArray()
  @ArrayMaxSize(FILTER_MAX_EVENTS)
  events!: unknown[];

  @ApiProperty({ type: [EventFilterCriterionDto] })
  @IsArray()
  @ArrayMaxSize(MAX_EVENT_FILTER_CRITERIA)
  @ValidateNested({ each: true })
  @Type(() => EventFilterCriterionDto)
  criteria!: EventFilterCriterionDto[];
}

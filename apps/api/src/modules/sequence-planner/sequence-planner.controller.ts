import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SequencePlannerService } from './sequence-planner.service';
import {
  SequencePlanRequestDto,
  AccountSequenceDto,
  ValidateSequenceDto
} from './dto/sequence-plan.dto';

@ApiTags('sequence-planner')
@Controller('sequence-planner')
export class SequencePlannerController {
  private readonly logger = new Logger(SequencePlannerController.name);

  constructor(private readonly sequencePlannerService: SequencePlannerService) {}

  @Get('account-sequence')
  @ApiOperation({
    summary: 'Get current sequence number for an account',
    description: 'Fetches the current sequence number from Horizon for a given account'
  })
  @ApiResponse({
    status: 200,
    description: 'Account sequence information',
    schema: {
      example: {
        account: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
        currentSequence: '12345',
        nextSequence: '12346'
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid account or network error'
  })
  async getAccountSequence(@Query() dto: AccountSequenceDto) {
    this.logger.log(`Fetching sequence for account ${dto.account} on ${dto.network}`);
    return this.sequencePlannerService.getAccountSequence(dto.account, dto.network);
  }

  @Post('validate-sequence')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate a proposed sequence number',
    description: 'Checks if a proposed sequence number is valid for an account'
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    schema: {
      example: {
        isValid: true,
        currentSequence: '12345',
        nextValidSequence: '12346',
        gap: 0,
        issues: ['Sequence number is valid and ready to use']
      }
    }
  })
  async validateSequence(@Body() dto: ValidateSequenceDto) {
    this.logger.log(`Validating sequence ${dto.proposedSequence} for account ${dto.account}`);
    return this.sequencePlannerService.validateSequence(
      dto.account,
      dto.proposedSequence,
      dto.network
    );
  }

  @Post('plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Plan transaction sequences with conflict detection',
    description: 'Analyzes a list of transactions and assigns/validates sequence numbers, detecting conflicts and dependencies'
  })
  @ApiResponse({
    status: 200,
    description: 'Sequence plan with conflict analysis',
    schema: {
      example: {
        plannedTransactions: [
          {
            id: 'payment-1',
            sourceAccount: 'GABC...',
            assignedSequence: 12346,
            status: 'valid',
            issues: [],
            description: 'Payment transaction'
          }
        ],
        conflicts: [],
        accountSequences: [
          {
            account: 'GABC...',
            currentSequence: '12345',
            nextSequence: '12346',
            plannedSequences: [12346, 12347]
          }
        ],
        summary: {
          total: 2,
          valid: 2,
          conflicts: 0,
          warnings: 0
        }
      }
    }
  })
  async planSequences(@Body() dto: SequencePlanRequestDto) {
    this.logger.log(`Planning sequences for ${dto.transactions.length} transactions`);
    return this.sequencePlannerService.planSequences(dto.transactions, dto.network);
  }
}

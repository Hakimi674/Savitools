import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { Sep10DebuggerService } from './sep10-debugger.service';
import { ChallengeRequestDto } from './dto/challenge-request.dto';
import { ValidateChallengeDto } from './dto/validate-challenge.dto';
import { SignChallengeDto } from './dto/sign-challenge.dto';
import { TokenExchangeDto } from './dto/token-exchange.dto';

@ApiTags('sep10')
@Controller('sep10')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class Sep10DebuggerController {
  constructor(private readonly sep10Service: Sep10DebuggerService) {}

  @Post('fetch-challenge')
  @ApiOperation({
    summary: 'Fetch SEP-10 challenge from anchor domain',
    description: 'Fetches a SEP-10 challenge transaction from the specified anchor domain and analyzes its structure',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge fetched and analyzed successfully',
    schema: {
      type: 'object',
      properties: {
        challenge: {
          type: 'object',
          description: 'Parsed challenge transaction details',
        },
        httpDiagnostics: {
          type: 'object',
          description: 'HTTP request/response diagnostics with sensitive data redacted',
        },
        validationChecks: {
          type: 'array',
          description: 'Array of validation check results',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request or challenge fetch failed',
  })
  async fetchChallenge(@Body() dto: ChallengeRequestDto) {
    return await this.sep10Service.fetchChallenge(dto);
  }

  @Post('validate-challenge')
  @ApiOperation({
    summary: 'Validate SEP-10 challenge transaction',
    description: 'Validates a SEP-10 challenge transaction against current SEP-10 rules and specifications',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge validated successfully',
    schema: {
      type: 'object',
      properties: {
        challenge: {
          type: 'object',
          description: 'Parsed challenge transaction details',
        },
        validationChecks: {
          type: 'array',
          description: 'Detailed validation results with per-check status',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid challenge or validation failed',
  })
  async validateChallenge(@Body() dto: ValidateChallengeDto) {
    return await this.sep10Service.validateChallenge(dto);
  }

  @Post('sign-challenge')
  @ApiOperation({
    summary: 'Sign SEP-10 challenge transaction',
    description: 'Signs a SEP-10 challenge transaction using provided keypairs. Secret keys are immediately redacted from all logs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge signed successfully',
    schema: {
      type: 'object',
      properties: {
        signedXdr: {
          type: 'string',
          description: 'Signed transaction XDR',
        },
        signatures: {
          type: 'array',
          description: 'Array of signature details',
        },
        redactionNotice: {
          type: 'string',
          description: 'Notice about secret key redaction for security',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid keypair or signing failed',
  })
  async signChallenge(@Body() dto: SignChallengeDto) {
    return await this.sep10Service.signChallenge(dto);
  }

  @Post('exchange-token')
  @ApiOperation({
    summary: 'Exchange signed challenge for JWT token',
    description: 'Exchanges a signed SEP-10 challenge for a JWT token. Tokens and sensitive data are redacted from responses.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token exchange completed',
    schema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'JWT token (redacted for security)',
        },
        decodedClaims: {
          type: 'object',
          description: 'Non-sensitive JWT claims',
        },
        httpDiagnostics: {
          type: 'object',
          description: 'HTTP diagnostics with sensitive data redacted',
        },
        redactionNotice: {
          type: 'string',
          description: 'Notice about token redaction for security',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Token exchange failed',
  })
  async exchangeToken(@Body() dto: TokenExchangeDto) {
    return await this.sep10Service.exchangeToken(dto);
  }
}
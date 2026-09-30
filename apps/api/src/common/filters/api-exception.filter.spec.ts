import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiErrorEnvelope, ApiExceptionFilter } from './api-exception.filter';
import { REQUEST_ID_HEADER } from '../interceptors/request-id.interceptor';

function hostFor(request: Record<string, unknown>) {
  const reply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    header: jest.fn(),
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, reply };
}

describe('ApiExceptionFilter', () => {
  it('renders an HttpException as the shared envelope', () => {
    const request = { url: '/api/v1/monitor/stream', method: 'GET', headers: {} };
    const { host, reply } = hostFor(request);

    new ApiExceptionFilter().catch(
      new BadRequestException('Invalid ISO date for "from"'),
      host,
    );

    const [envelope] = reply.send.mock.calls[0] as [ApiErrorEnvelope];
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(envelope).toMatchObject({
      statusCode: 400,
      message: 'Invalid ISO date for "from"',
      error: 'Bad Request',
      path: '/api/v1/monitor/stream',
    });
    expect(typeof envelope.timestamp).toBe('string');
  });

  it('keeps validation message arrays intact', () => {
    const { host, reply } = hostFor({ url: '/api/v1/x', method: 'POST', headers: {} });

    new ApiExceptionFilter().catch(
      new BadRequestException({
        statusCode: 400,
        message: ['page must be an integer number'],
        error: 'Bad Request',
      }),
      host,
    );

    const [envelope] = reply.send.mock.calls[0] as [ApiErrorEnvelope];
    expect(envelope.message).toEqual(['page must be an integer number']);
  });

  it('does not leak the message of an unexpected error', () => {
    const { host, reply } = hostFor({ url: '/api/v1/x', method: 'GET', headers: {} });

    new ApiExceptionFilter().catch(
      new Error('connect ECONNREFUSED 127.0.0.1:6379'),
      host,
    );

    const [envelope] = reply.send.mock.calls[0] as [ApiErrorEnvelope];
    expect(reply.status).toHaveBeenCalledWith(500);
    expect(envelope.message).toBe('Internal server error');
    expect(JSON.stringify(envelope)).not.toContain('ECONNREFUSED');
  });

  it('reuses the request id the interceptor stored', () => {
    const { host, reply } = hostFor({
      url: '/api/v1/x',
      method: 'GET',
      headers: {},
      requestId: 'req-123',
    });

    new ApiExceptionFilter().catch(new NotFoundException(), host);

    const [envelope] = reply.send.mock.calls[0] as [ApiErrorEnvelope];
    expect(envelope.requestId).toBe('req-123');
    expect(reply.header).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'req-123');
  });

  it('falls back to the caller-supplied header when no interceptor ran', () => {
    const { host, reply } = hostFor({
      url: '/api/v1/missing',
      method: 'GET',
      headers: { [REQUEST_ID_HEADER]: ' from-client ' },
    });

    new ApiExceptionFilter().catch(new NotFoundException('Cannot GET /x'), host);

    const [envelope] = reply.send.mock.calls[0] as [ApiErrorEnvelope];
    expect(envelope.requestId).toBe('from-client');
  });

  it('keeps Nest WebSocket handling for a non-HTTP context', () => {
    const emit = jest.fn();
    const host = {
      getType: () => 'ws',
      switchToWs: () => ({ getClient: () => ({ emit }) }),
    } as unknown as ArgumentsHost;

    new ApiExceptionFilter().catch(new Error('stream blew up'), host);

    expect(emit).toHaveBeenCalledWith('exception', {
      status: 'error',
      message: 'stream blew up',
    });
  });
});

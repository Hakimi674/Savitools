import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import {
  REQUEST_ID_HEADER,
  RequestIdInterceptor,
} from './request-id.interceptor';

function contextFor(headers: Record<string, string | string[] | undefined>) {
  const request: Record<string, unknown> = { headers };
  const reply = { header: jest.fn() };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
    }),
  } as unknown as ExecutionContext;
  return { context, request, reply };
}

const next = { handle: () => of('result') } as unknown as CallHandler;

describe('RequestIdInterceptor', () => {
  it('generates an id, exposes it on the request and echoes it on the response', () => {
    const { context, request, reply } = contextFor({});
    let emitted: unknown;

    new RequestIdInterceptor().intercept(context, next).subscribe((value) => {
      emitted = value;
    });

    expect(emitted).toBe('result');
    const id = request.requestId as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(reply.header).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
  });

  it('reuses a caller-supplied id so a trace survives across services', () => {
    const { context, request, reply } = contextFor({
      [REQUEST_ID_HEADER]: 'trace-abc',
    });

    new RequestIdInterceptor().intercept(context, next).subscribe();

    expect(request.requestId).toBe('trace-abc');
    expect(reply.header).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'trace-abc');
  });

  it('replaces an over-long caller-supplied id', () => {
    const oversized = 'x'.repeat(200);
    const { context, request } = contextFor({ [REQUEST_ID_HEADER]: oversized });

    new RequestIdInterceptor().intercept(context, next).subscribe();

    expect(request.requestId).not.toBe(oversized);
    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates a fresh id when the header is blank', () => {
    const { context, request } = contextFor({ [REQUEST_ID_HEADER]: '   ' });

    new RequestIdInterceptor().intercept(context, next).subscribe();

    expect(typeof request.requestId).toBe('string');
    expect((request.requestId as string).trim()).not.toBe('');
  });

  it('leaves a non-HTTP context untouched', () => {
    const context = {
      getType: () => 'ws',
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;
    let emitted: unknown;

    new RequestIdInterceptor().intercept(context, next).subscribe((value) => {
      emitted = value;
    });

    expect(emitted).toBe('result');
  });
});

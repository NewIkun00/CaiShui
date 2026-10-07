import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface ExceptionBody {
  code?: string;
  message?: string | string[];
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body: ExceptionBody = typeof raw === 'object' && raw !== null ? raw as ExceptionBody : {};
    const fallback = status === 500
      ? 'Internal server error'
      : typeof raw === 'string'
        ? raw
        : 'Request failed';
    const message = Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? fallback);
    const traceValue = request.headers['x-request-id'];
    const traceId = Array.isArray(traceValue) ? traceValue[0] : (traceValue ?? 'missing-trace-id');
    void reply.status(status).send({
      error: {
        code: body.code ?? `HTTP_${status}`,
        message,
        traceId,
        ...(body.details === undefined ? {} : { details: body.details }),
      },
    });
  }
}

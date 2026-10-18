import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

interface NormalizedError {
  status: number;
  body: Record<string, unknown>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const { status, body } = this.normalize(exception);

    response.status(status).json({
      ...body,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const body = typeof payload === 'string' ? { message: payload } : (payload as Record<string, unknown>);
      return { status: exception.getStatus(), body };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return { status: HttpStatus.CONFLICT, body: { message: 'Resource already exists', error: 'Conflict' } };
        case 'P2025':
          return { status: HttpStatus.NOT_FOUND, body: { message: 'Resource not found', error: 'Not Found' } };
        case 'P2034':
          return {
            status: HttpStatus.CONFLICT,
            body: { message: 'Concurrent update detected, please retry', error: 'Conflict' },
          };
        case 'P2003':
          return {
            status: HttpStatus.CONFLICT,
            body: { message: 'Referenced resource does not exist', error: 'Conflict' },
          };
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { message: 'Internal server error', error: 'Internal Server Error' },
    };
  }
}

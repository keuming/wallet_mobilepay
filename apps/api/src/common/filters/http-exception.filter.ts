import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    // § Corrigé à l'audit pré-production : le message d'une exception NON
    // gérée (erreur Prisma, bug interne) était renvoyé tel quel au client.
    // Ça pouvait exposer des noms de tables, des fragments de requêtes SQL
    // ou des chemins de fichiers internes — exactement ce qu'un attaquant
    // cherche pour cartographier le système. On ne renvoie désormais un
    // message détaillé QUE pour les exceptions volontairement levées par le
    // code métier (HttpException) ; tout le reste devient un message
    // générique, le détail restant disponible dans les logs serveur.
    const isHandledException = exception instanceof HttpException;

    const message = isHandledException
      ? typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as any).message
        : (exception as HttpException).message
      : 'Une erreur interne est survenue. Réessayez dans quelques instants.';

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
        path: request.url,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

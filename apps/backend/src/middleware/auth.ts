import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/env.js';
import logger from '@/utils/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload;
    req.user = { id: decoded.userId, email: decoded.email };
    next();
  } catch (error) {
    // 401 (not 403) for an expired/invalid token — the mobile client's refresh
    // interceptor keys off 401, so a 403 here meant an expired access token
    // never triggered a refresh and the user was bounced to login instead.
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired', code: 'token_expired' });
      return;
    }
    res.status(401).json({ error: 'Invalid token' });
  }
}

/** Application error carrying an intended HTTP status. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function errorHandler(
  err: Error & { status?: number; code?: string },
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const status = err instanceof HttpError ? err.status : err.status ?? 500;

  logger.error('Unhandled request error', {
    requestId: req.requestId,
    path: req.originalUrl,
    status,
    err: { name: err.name, message: err.message, stack: err.stack },
  });

  if (err instanceof jwt.JsonWebTokenError) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // Internal failures never leak their message to the client; everything the
  // caller needs to report it is the request id.
  const body =
    status >= 500
      ? { error: 'Internal server error', requestId: req.requestId }
      : { error: err.message, requestId: req.requestId };

  res.status(status).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found' });
}

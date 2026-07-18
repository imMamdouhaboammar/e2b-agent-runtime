import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function timingSafeTokenMatch(providedToken: string, expectedToken: string): boolean {
  if (!providedToken || !expectedToken) return false;

  const a = Buffer.from(providedToken, 'utf-8');
  const b = Buffer.from(expectedToken, 'utf-8');

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

export function createAuthMiddleware(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization Bearer header.',
      });
      return;
    }

    const providedToken = authHeader.substring(7).trim();

    if (!timingSafeTokenMatch(providedToken, expectedToken)) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid access token provided.',
      });
      return;
    }

    next();
  };
}

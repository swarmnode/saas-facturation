import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err.message);
  const status = err.message.includes('INALTÉR') || err.message.includes('ISCA') ? 403 : 500;
  res.status(status).json({ error: err.message });
}

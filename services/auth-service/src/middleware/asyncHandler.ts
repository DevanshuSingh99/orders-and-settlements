/**
 * Wraps an async Express route handler so a rejected promise is forwarded
 * to `next(err)` instead of crashing the process or hanging the request.
 */
import type { NextFunction, Request, Response } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

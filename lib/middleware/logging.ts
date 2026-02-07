import type { Middleware } from './index';

export const loggingMiddleware: Middleware = async (request, next) => {
  const start = Date.now();
  const method = request.method;
  const url = request.nextUrl.pathname;

  const response = await next();

  const duration = Date.now() - start;
  console.log(`[${method}] ${url} - ${response.status} (${duration}ms)`);

  return response;
};

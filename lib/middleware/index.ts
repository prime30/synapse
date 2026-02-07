import { NextRequest, NextResponse } from 'next/server';

export type Middleware = (
  request: NextRequest,
  next: () => Promise<NextResponse>
) => Promise<NextResponse>;

export function composeMiddleware(...middlewares: Middleware[]) {
  return async (request: NextRequest): Promise<NextResponse> => {
    let index = -1;

    async function dispatch(i: number): Promise<NextResponse> {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      if (i >= middlewares.length) {
        return NextResponse.next();
      }

      const middleware = middlewares[i];
      return middleware(request, () => dispatch(i + 1));
    }

    return dispatch(0);
  };
}

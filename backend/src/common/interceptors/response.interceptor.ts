import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface PaginatedResult<T> {
  items: T[];
  meta: { page: number; limit: number; total: number };
}

function isPaginated(value: unknown): value is PaginatedResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    'meta' in value &&
    Array.isArray((value as PaginatedResult<unknown>).items)
  );
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((result: unknown) => {
        if (isPaginated(result)) {
          return { success: true, data: result.items, meta: result.meta };
        }
        return { success: true, data: result ?? null };
      }),
    );
  }
}

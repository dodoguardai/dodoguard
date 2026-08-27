import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';

/**
 * Zod v4 schemas are not assignable to @hookform/resolvers' Zod v3 overload; TS picks the wrong
 * overload and errors. Cast through `never` so the v4 branch is used at runtime and compile time.
 */
export function zodResolverV4<T extends FieldValues>(schema: object): Resolver<T> {
  return zodResolver(schema as never) as Resolver<T>;
}

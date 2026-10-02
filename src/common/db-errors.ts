import { QueryFailedError } from 'typeorm';

/** Whether a write failed because a unique key already has that value. */
export function isDuplicateKey(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

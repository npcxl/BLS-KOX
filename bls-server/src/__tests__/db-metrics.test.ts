import { describe, it, expect } from 'vitest';
import { dbQueryDurationSeconds, dbQueryErrorsTotal } from '../observability/metrics';

describe('DB Metrics', () => {
  it('should have DB query duration histogram registered', () => {
    expect(dbQueryDurationSeconds).toBeDefined();
  });

  it('should have DB query errors counter registered', () => {
    expect(dbQueryErrorsTotal).toBeDefined();
  });
});

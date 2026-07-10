import { describe, it, expect } from 'vitest';
import { redisOperationDurationSeconds, redisOperationErrorsTotal } from '../observability/metrics';

describe('Redis Metrics', () => {
  it('should have Redis operation duration histogram registered', () => {
    expect(redisOperationDurationSeconds).toBeDefined();
  });

  it('should have Redis operation errors counter registered', () => {
    expect(redisOperationErrorsTotal).toBeDefined();
  });
});

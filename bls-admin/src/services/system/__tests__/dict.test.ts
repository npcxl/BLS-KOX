/**
 * Dict Cache 测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock request
const mockRequest = vi.fn();
vi.mock('@umijs/max', () => ({
  request: (...args: any[]) => mockRequest(...args),
}));

import { fetchDictData, clearDictCache } from '@/services/system/dict';

describe('fetchDictData', () => {
  beforeEach(() => {
    clearDictCache();
    mockRequest.mockReset();
  });

  it('returns cached data on second call', async () => {
    mockRequest.mockResolvedValueOnce({
      code: 200,
      data: [{ dictDataId: '1', dictLabel: '启用', dictValue: '1' }],
    });

    const data1 = await fetchDictData('sys_status');
    const data2 = await fetchDictData('sys_status');

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(data1).toEqual(data2);
    expect(data1).toHaveLength(1);
  });

  it('caches empty array on success', async () => {
    mockRequest.mockResolvedValueOnce({ code: 200, data: [] });
    const data1 = await fetchDictData('empty_type');
    const data2 = await fetchDictData('empty_type');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(data1).toEqual([]);
  });

  it('does NOT cache on request failure', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Network error'));
    mockRequest.mockResolvedValueOnce({
      code: 200, data: [{ dictDataId: '1', dictLabel: '启用', dictValue: '1' }],
    });
    await expect(fetchDictData('sys_status')).rejects.toThrow();
    const data = await fetchDictData('sys_status');
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(data).toHaveLength(1);
  });

  it('does NOT cache when code is not 200', async () => {
    mockRequest.mockResolvedValueOnce({ code: 500, data: [] });
    mockRequest.mockResolvedValueOnce({
      code: 200, data: [{ dictDataId: '1', dictLabel: '启用', dictValue: '1' }],
    });
    await expect(fetchDictData('sys_status')).rejects.toThrow();
    const data = await fetchDictData('sys_status');
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache when data is not an array', async () => {
    mockRequest.mockResolvedValueOnce({ code: 200, data: null });
    mockRequest.mockResolvedValueOnce({
      code: 200, data: [{ dictDataId: '1', dictLabel: '启用', dictValue: '1' }],
    });
    await expect(fetchDictData('sys_status')).rejects.toThrow();
    const data = await fetchDictData('sys_status');
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent requests', async () => {
    let resolveFirst: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
    mockRequest.mockReturnValueOnce(firstPromise);

    const p1 = fetchDictData('sys_status');
    const p2 = fetchDictData('sys_status');
    expect(mockRequest).toHaveBeenCalledTimes(1);

    resolveFirst!({ code: 200, data: [{ dictDataId: '1', dictLabel: '启用', dictValue: '1' }] });
    const results = await Promise.all([p1, p2]);
    expect(results[0]).toEqual(results[1]);
  });
});

describe('clearDictCache', () => {
  beforeEach(() => { clearDictCache(); mockRequest.mockReset(); });

  it('clears specific dict type', async () => {
    mockRequest.mockResolvedValueOnce({ code: 200, data: [] });
    mockRequest.mockResolvedValueOnce({ code: 200, data: [] });
    await fetchDictData('sys_status');
    await fetchDictData('sys_gender');
    clearDictCache('sys_status');
    mockRequest.mockResolvedValueOnce({ code: 200, data: [{ dictDataId: '2', dictLabel: '禁用', dictValue: '0' }] });
    await fetchDictData('sys_status');
    expect(mockRequest).toHaveBeenCalledTimes(3);
    await fetchDictData('sys_gender');
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  it('clears all dict caches', async () => {
    mockRequest.mockResolvedValue({ code: 200, data: [] });
    await fetchDictData('sys_status');
    await fetchDictData('sys_gender');
    clearDictCache();
    await fetchDictData('sys_status');
    await fetchDictData('sys_gender');
    expect(mockRequest).toHaveBeenCalledTimes(4);
  });
});

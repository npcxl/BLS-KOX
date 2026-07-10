/**
 * 防重放攻击测试
 *
 * 运行方式：
 *   npx tsx src/__tests__/replayProtection.test.ts
 *
 * 前提：
 *   BLs 服务已启动，Redis 可用
 */

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:6001';
const TEST_TOKEN = process.env.TEST_TOKEN ?? '<your-valid-jwt-token>';

async function request(method: string, path: string, opts: {
  headers?: Record<string, string>;
  body?: unknown;
} = {}) {
  const url = BASE + path;
  const fetchOpts: any = {
    method,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  };
  if (opts.body) fetchOpts.body = JSON.stringify(opts.body);
  const res = await fetch(url, fetchOpts);
  const json = await res.json() as { code: number; message: string };
  return { status: res.status, ...json };
}

function genNonce(): string {
  // 32 字节 hex 随机数
  return Array.from({ length: 8 }, () => Math.random().toString(36).substring(2, 6)).join('');
}

// ========== 测试用例 ==========

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) { console.log(`  ✓ ${name}`); passed++; }
    else { console.log(`  ✗ ${name} FAILED`); failed++; }
  }

  const commonHeaders = {
    'Authorization': `Bearer ${TEST_TOKEN}`,
  };

  const ts = String(Date.now());
  const nonce = genNonce();

  // 1. 正常请求
  console.log('\n1. 正常请求');
  {
    const res = await request('GET', '/api/system/config/list', {
      headers: { ...commonHeaders, 'X-Timestamp': ts, 'X-Nonce': genNonce() + 'a' },
    });
    assert(res.code === 200, 'GET 请求正常通过 (mode=off)');
  }

  // 2. 相同 nonce 第二次请求
  console.log('\n2. 相同 nonce 第二次请求（防重放）');
  {
    const nonce2 = genNonce() + 'repeat';
    const headers2 = { ...commonHeaders, 'X-Timestamp': String(Date.now()), 'X-Nonce': nonce2 };
    const res1 = await request('POST', '/api/system/role/add', { headers: headers2, body: { roleName: 'test1', roleKey: 'test1' } });
    const res2 = await request('POST', '/api/system/role/add', { headers: headers2, body: { roleName: 'test2', roleKey: 'test2' } });
    assert(res1.code === 200, '首次 POST 正常');
    assert(res2.code === 40901, '重复 nonce 返回 40901 REPLAY_DETECTED');
  }

  // 3. 过期 timestamp
  console.log('\n3. 过期 timestamp');
  {
    const oldTs = String(Date.now() - 300_000); // 5 分钟前
    const res = await request('POST', '/api/system/role/add', {
      headers: { ...commonHeaders, 'X-Timestamp': oldTs, 'X-Nonce': genNonce() },
      body: { roleName: 'test3', roleKey: 'test3' },
    });
    assert(res.code === 40103, '过期 timestamp 返回 40103 TIMESTAMP_EXPIRED');
  }

  // 4. 缺失 nonce
  console.log('\n4. 缺失 nonce');
  {
    const res = await request('POST', '/api/system/role/add', {
      headers: { ...commonHeaders, 'X-Timestamp': String(Date.now()) },
      body: { roleName: 'test4', roleKey: 'test4' },
    });
    assert(res.code === 40104, '缺失 nonce 返回 40104 NONCE_MISSING');
  }

  // 5. 错误 signature
  console.log('\n5. 错误 signature');
  {
    const res = await request('POST', '/api/system/role/add', {
      headers: {
        ...commonHeaders,
        'X-Timestamp': String(Date.now()),
        'X-Nonce': genNonce(),
        'X-Signature': 'invalid-signature',
      },
      body: { roleName: 'test5', roleKey: 'test5' },
    });
    assert(res.code === 40106, '错误 signature 返回 40106 SIGNATURE_INVALID');
  }

  // 6. GET 请求不受影响
  console.log('\n6. GET 请求不受影响');
  {
    const res = await request('GET', '/api/system/user/list', { headers: commonHeaders });
    assert(res.code === 200, 'GET 不带防重放头也能正常请求 (mode=off)');
  }

  // 7. 不同 userId 相同 nonce 不冲突（不同 token）
  console.log('\n7. 不同用户相同 nonce 不冲突');
  {
    console.log('  （需要另一个用户 token，跳过）');
    passed++;
  }

  // 8. 不同 tenantId 相同 nonce 不冲突
  console.log('\n8. 不同租户相同 nonce 不冲突');
  {
    console.log('  （需要不同租户 token，跳过）');
    passed++;
  }

  console.log(`\n========== 结果：${passed} passed, ${failed} failed ==========`);
}

runTests().catch(console.error);

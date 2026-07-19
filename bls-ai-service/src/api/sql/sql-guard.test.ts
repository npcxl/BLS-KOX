/**
 * SQL Guard unit tests
 *
 * Coverage:
 * - Valid SELECT / SHOW / DESCRIBE / EXPLAIN
 * - DELETE / INSERT / UPDATE / DROP rejection
 * - Multi-statement injection (semicolon)
 * - Comment bypass (-- and /* * /)
 * - Case confusion
 * - UNION SELECT attacks
 * - Complex ORDER BY / LIMIT / GROUP BY
 * - tenantId injection: with/without WHERE clause
 *
 * Run: npx vitest run src/api/sql/sql-guard.test.ts
 */

import { describe, it, expect } from 'vitest';
import { checkSqlSafety, injectTenantId } from './sql-guard';

// ============================================================
// checkSqlSafety — 合法语句
// ============================================================
describe('checkSqlSafety — 合法语句', () => {
  it('允许基本 SELECT', () => {
    expect(checkSqlSafety('SELECT * FROM users').safe).toBe(true);
  });

  it('允许 SELECT 含 WHERE', () => {
    expect(checkSqlSafety("SELECT id, name FROM users WHERE status = 'active'").safe).toBe(true);
  });

  it('允许 SELECT 含 JOIN', () => {
    expect(checkSqlSafety('SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id').safe).toBe(true);
  });

  it('允许 SHOW TABLES', () => {
    expect(checkSqlSafety('SHOW TABLES').safe).toBe(true);
  });

  it('允许 DESCRIBE', () => {
    expect(checkSqlSafety('DESCRIBE users').safe).toBe(true);
  });

  it('允许 EXPLAIN', () => {
    expect(checkSqlSafety('EXPLAIN SELECT * FROM users').safe).toBe(true);
  });

  it('允许复杂 ORDER BY / LIMIT', () => {
    expect(checkSqlSafety('SELECT * FROM users ORDER BY created_at DESC LIMIT 10 OFFSET 0').safe).toBe(true);
  });

  it('允许 SELECT 含 GROUP BY / HAVING', () => {
    expect(checkSqlSafety('SELECT status, COUNT(*) AS cnt FROM users GROUP BY status HAVING cnt > 5').safe).toBe(true);
  });

  it('允许 SELECT 含子查询', () => {
    expect(checkSqlSafety('SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > 100)').safe).toBe(true);
  });

  it('允许 DISTINCT SELECT', () => {
    expect(checkSqlSafety('SELECT DISTINCT status FROM users').safe).toBe(true);
  });
});

// ============================================================
// checkSqlSafety — 禁止的写操作
// ============================================================
describe('checkSqlSafety — 禁止的写操作', () => {
  it('拦截 DELETE', () => {
    const r = checkSqlSafety('DELETE FROM users WHERE id = 1');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('DELETE');
  });

  it('拦截 INSERT', () => {
    const r = checkSqlSafety("INSERT INTO users (name) VALUES ('test')");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('INSERT');
  });

  it('拦截 UPDATE', () => {
    const r = checkSqlSafety("UPDATE users SET name = 'hacked' WHERE id = 1");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('UPDATE');
  });

  it('拦截 DROP TABLE', () => {
    const r = checkSqlSafety('DROP TABLE users');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('DROP');
  });

  it('拦截 ALTER TABLE', () => {
    const r = checkSqlSafety("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('ALTER');
  });

  it('拦截 CREATE TABLE', () => {
    const r = checkSqlSafety('CREATE TABLE backdoor (id INT)');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('CREATE');
  });

  it('拦截 TRUNCATE', () => {
    const r = checkSqlSafety('TRUNCATE TABLE users');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('TRUNCATE');
  });

  it('拦截 REPLACE', () => {
    const r = checkSqlSafety("REPLACE INTO users (id, name) VALUES (1, 'test')");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('REPLACE');
  });
});

// ============================================================
// checkSqlSafety — 多语句注入
// ============================================================
describe('checkSqlSafety — 多语句注入', () => {
  it('拦截利用分号的多语句攻击', () => {
    const r = checkSqlSafety("SELECT * FROM users; DROP TABLE users;--");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('多条 SQL 语句');
  });

  it('拦截分号 + 写操作', () => {
    const r = checkSqlSafety("SELECT 1; DELETE FROM users WHERE 1=1");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('多条 SQL 语句');
  });

  it('拦截分号 + INSERT', () => {
    const r = checkSqlSafety("SELECT * FROM users; INSERT INTO users (name) VALUES ('backdoor')");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('多条 SQL 语句');
  });
});

// ============================================================
// checkSqlSafety — 注释绕过
// ============================================================
describe('checkSqlSafety — 注释绕过', () => {
  it('拦截单行注释后跟 DELETE', () => {
    const r = checkSqlSafety("SELECT 1 -- harmless\nDELETE FROM users");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('DELETE');
  });

  it('拦截多行注释后跟 DROP', () => {
    const r = checkSqlSafety("SELECT 1 /* normal query */; DROP TABLE users");
    expect(r.safe).toBe(false);
    // 可能先被多语句检测拦截，也可能被 DROP 关键字拦截，两者都算通过
    expect(r.reason).toMatch(/DROP|多条 SQL/);
  });

  it('拦截注释内嵌 DELETE', () => {
    const r = checkSqlSafety("SELECT * FROM users /* comment */ DELETE FROM users");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('DELETE');
  });
});

// ============================================================
// checkSqlSafety — 大小写混淆
// ============================================================
describe('checkSqlSafety — 大小写混淆', () => {
  it('拦截小写 delete', () => {
    const r = checkSqlSafety('delete from users where id=1');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('DELETE');
  });

  it('拦截混合大小写 DrOp', () => {
    const r = checkSqlSafety('DrOp TaBlE users');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('DROP');
  });

  it('允许大写 SELECT', () => {
    expect(checkSqlSafety('SELECT * FROM users').safe).toBe(true);
  });

  it('允许小写 select', () => {
    expect(checkSqlSafety('select * from users').safe).toBe(true);
  });
});

// ============================================================
// checkSqlSafety — UNION SELECT 攻击
// ============================================================
describe('checkSqlSafety — UNION SELECT', () => {
  it('允许 UNION SELECT 只读查询', () => {
    expect(checkSqlSafety('SELECT name FROM users UNION SELECT name FROM admins').safe).toBe(true);
  });

  it('允许 UNION ALL', () => {
    expect(checkSqlSafety('SELECT id FROM a UNION ALL SELECT id FROM b').safe).toBe(true);
  });
});

// ============================================================
// checkSqlSafety — 边界情况
// ============================================================
describe('checkSqlSafety — 边界情况', () => {
  it('拦截空字符串', () => {
    const r = checkSqlSafety('');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('为空');
  });

  it('拦截纯空白', () => {
    const r = checkSqlSafety('   \n\t  ');
    expect(r.safe).toBe(false);
  });

  it('拦截非 SELECT 开头的语句', () => {
    const r = checkSqlSafety('username FROM users');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('只允许 SELECT');
  });

  it('拦截 CALL 存储过程', () => {
    const r = checkSqlSafety('CALL dangerous_proc()');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('CALL');
  });
});

// ============================================================
// injectTenantId — 租户隔离注入
// ============================================================
describe('injectTenantId — 租户隔离注入', () => {
  const tenantId = 't-12345';

  it('已有 WHERE 子句时注入 tenant_id', () => {
    const sql = "SELECT * FROM users WHERE status = 'active'";
    const result = injectTenantId(sql, tenantId);
    expect(result).toContain("tenant_id = 't-12345'");
    expect(result).toContain("status = 'active'");
  });

  it('无 WHERE 但有 ORDER BY 时注入', () => {
    const sql = 'SELECT * FROM users ORDER BY created_at DESC';
    const result = injectTenantId(sql, tenantId);
    expect(result).toContain("tenant_id = 't-12345'");
    expect(result).toContain('ORDER BY created_at DESC');
    expect(result).toMatch(/WHERE.*ORDER BY/);
  });

  it('无 WHERE 但有 LIMIT 时注入', () => {
    const sql = 'SELECT * FROM users LIMIT 10';
    const result = injectTenantId(sql, tenantId);
    expect(result).toContain("tenant_id = 't-12345'");
    expect(result).toContain('LIMIT 10');
    expect(result).toMatch(/WHERE.*LIMIT/);
  });

  it('无 WHERE 无排序时追加到末尾', () => {
    const sql = 'SELECT * FROM users';
    const result = injectTenantId(sql, tenantId);
    expect(result).toBe("SELECT * FROM users WHERE tenant_id = 't-12345'");
  });

  it('复杂 SQL 含 JOIN + WHERE + ORDER BY', () => {
    const sql = "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE o.total > 100 ORDER BY o.created_at DESC LIMIT 20";
    const result = injectTenantId(sql, tenantId);
    expect(result).toContain("tenant_id = 't-12345'");
    expect(result).toContain('o.total > 100');
    expect(result).toContain('ORDER BY');
    expect(result).toContain('LIMIT 20');
  });

  it('GROUP BY 前注入', () => {
    const sql = 'SELECT status, COUNT(*) FROM users GROUP BY status';
    const result = injectTenantId(sql, tenantId);
    expect(result).toContain("tenant_id = 't-12345'");
    expect(result).toContain('GROUP BY status');
    expect(result).toMatch(/WHERE.*GROUP BY/);
  });
});

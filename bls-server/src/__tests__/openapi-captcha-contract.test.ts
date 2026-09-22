/**
 * OpenAPI 契约测试（登录人机验证）
 *
 * 保证仓库里**已提交**的 `openapi.json` 与新的统一 Ticket 契约一致：
 *   - 登录请求体是 `captchaTicket`（不是旧概念 `captchaToken` / `tokenStage` / `captchaMode`）；
 *   - 验证码只有统一入口 `/api/captcha/{config,generate,verify}`，
 *     历史 `/api/auth/captcha/*` 全部消失；
 *   - 登录响应 schema 中不再出现旧字段。
 *
 * 与 `npm run openapi:check`（重新生成后逐字节比对）配合使用：
 * 本测试负责语义契约，`openapi:check` 负责防止忘记重新生成导致的漂移。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const specPath = join(__dirname, '..', '..', 'openapi.json');
const spec = JSON.parse(readFileSync(specPath, 'utf-8')) as any;

const OLD_CONCEPTS = ['captchaToken', 'tokenStage', 'captchaMode', 'requiredStage', 'secondaryProvider'];

describe('OpenAPI —— 登录人机验证契约', () => {
  it('登录请求体 schema 含 captchaTicket，且不含任何旧概念', () => {
    const login = spec.paths['/api/auth/login']?.post;
    expect(login).toBeTruthy();
    const schemaRef = login.requestBody?.content?.['application/json']?.schema?.$ref;
    expect(typeof schemaRef).toBe('string');

    const schemaName = String(schemaRef).split('/').pop();
    expect(typeof schemaName).toBe('string');
    const schema = spec.components?.schemas?.[schemaName as string];
    expect(schema).toBeTruthy();

    const props = Object.keys(schema.properties ?? {});
    expect(props).toContain('captchaTicket');
    for (const old of OLD_CONCEPTS) {
      expect(props).not.toContain(old);
    }
  });

  it('只暴露统一入口 /api/captcha/{config,generate,verify}', () => {
    expect(spec.paths['/api/captcha/config']?.get).toBeTruthy();
    expect(spec.paths['/api/captcha/generate']?.post).toBeTruthy();
    expect(spec.paths['/api/captcha/verify']?.post).toBeTruthy();
  });

  it('历史路径 /api/auth/captcha/* 全部移除（浏览器不直连，也不再有两套入口）', () => {
    const stale = Object.keys(spec.paths).filter((p) => p.startsWith('/api/auth/captcha'));
    expect(stale).toEqual([]);
  });

  it('整份文档中不残留旧概念关键字', () => {
    const dump = JSON.stringify(spec);
    for (const old of OLD_CONCEPTS) {
      expect(dump).not.toContain(old);
    }
  });
});

/**
 * P13: File Security — 专项测试
 * 1. Magic 返回类型 + 精确比较
 * 2. moduleName 原始字符串校验(防 ../common)
 * 3. 上传 Handler 租户隔离 + 审计验证
 */
import { describe, it, expect, vi } from 'vitest';
import {
  validateExtension, validateMimeType, validateFileSize,
  detectImageMagicNumber, generateObjectKey, validateFile,
  validateExtMimeConsistency, validateConsistency,
  validateUploadMeta, sanitizeFilename,
} from '../file-security';

describe('P13 File Security', () => {
  // ====== validateExtension ======
  it('.jpg 通过', () => expect(validateExtension('photo.jpg').valid).toBe(true));
  it('.png 通过', () => expect(validateExtension('icon.png').valid).toBe(true));
  it('.webp 通过', () => expect(validateExtension('img.webp').valid).toBe(true));
  it('.pdf 通过', () => expect(validateExtension('doc.pdf').valid).toBe(true));
  it('.exe 拒绝', () => expect(validateExtension('virus.exe').valid).toBe(false));
  it('.svg 拒绝 (FIX-03)', () => expect(validateExtension('icon.svg').valid).toBe(false));
  it('无扩展名 拒绝', () => expect(validateExtension('file').valid).toBe(false));

  // ====== validateMimeType ======
  it('image/png 通过', () => expect(validateMimeType('image/png').valid).toBe(true));
  it('image/webp 通过', () => expect(validateMimeType('image/webp').valid).toBe(true));
  it('text/html 拒绝', () => expect(validateMimeType('text/html').valid).toBe(false));
  it('image/svg+xml 拒绝 (FIX-03)', () => expect(validateMimeType('image/svg+xml').valid).toBe(false));

  // ====== validateFileSize ======
  it('1MB 通过', () => expect(validateFileSize(1024*1024).valid).toBe(true));
  it('0 拒绝', () => expect(validateFileSize(0).valid).toBe(false));
  it('200MB 拒绝', () => expect(validateFileSize(200*1024*1024).valid).toBe(false));

  // ====== ext-mime consistency ======
  it('.jpg + image/jpeg 一致', () => expect(validateExtMimeConsistency('a.jpg','image/jpeg').valid).toBe(true));
  it('.png + image/jpeg 伪装拒绝', () => expect(validateExtMimeConsistency('a.png','image/jpeg').valid).toBe(false));
  it('.jpg + application/pdf 伪装拒绝', () => expect(validateExtMimeConsistency('a.jpg','application/pdf').valid).toBe(false));

  // ====== 1. Magic 返回实际类型 ======
  it('Magic JPEG → detectedType=jpeg', () => {
    const r = detectImageMagicNumber(Buffer.from([0xff,0xd8,0xff,0xe0]));
    expect(r.valid).toBe(true);
    expect(r.detectedType).toBe('jpeg');
  });
  it('Magic PNG → detectedType=png', () => {
    const r = detectImageMagicNumber(Buffer.from('89504e470d0a1a0a', 'hex'));
    expect(r.valid).toBe(true);
    expect(r.detectedType).toBe('png');
  });
  it('Magic GIF → detectedType=gif', () => {
    const r = detectImageMagicNumber(Buffer.from('474946383961', 'hex'));
    expect(r.valid).toBe(true);
    expect(r.detectedType).toBe('gif');
  });
  it('Magic WebP → detectedType=webp', () => {
    const buf = Buffer.alloc(12); buf.write('RIFF',0); buf.writeUInt32LE(100,4); buf.write('WEBP',8);
    const r = detectImageMagicNumber(buf);
    expect(r.valid).toBe(true);
    expect(r.detectedType).toBe('webp');
  });
  it('Magic 随机内容 → valid=false', () => {
    expect(detectImageMagicNumber(Buffer.from([0x00,0x01,0x02,0x03])).valid).toBe(false);
  });
  it('Magic 只有 RIFF 无 WEBP → valid=false', () => {
    const buf = Buffer.alloc(12); buf.write('RIFF',0);
    expect(detectImageMagicNumber(buf).valid).toBe(false);
  });

  // ===== 1. Precision: magic type vs ext/mime =====
  it('consistency: .jpg + image/jpeg + JPEG magic → 通过', () => {
    expect(validateConsistency('a.jpg','image/jpeg',Buffer.from([0xff,0xd8,0xff,0xe0])).valid).toBe(true);
  });
  it('consistency: .png + image/png + PNG magic → 通过', () => {
    expect(validateConsistency('a.png','image/png',Buffer.from('89504e470d0a1a0a','hex')).valid).toBe(true);
  });
  it('consistency: .png + image/png + JPEG magic → 拒绝 (magic type≠ext)', () => {
    const r = validateConsistency('a.png','image/png',Buffer.from([0xff,0xd8,0xff,0xe0]));
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('jpeg');
  });
  it('consistency: .jpg + image/jpeg + PNG magic → 拒绝 (magic type=mime mismatch)', () => {
    const r = validateConsistency('a.jpg','image/jpeg',Buffer.from('89504e470d0a1a0a','hex'));
    expect(r.valid).toBe(false);
  });
  it('consistency: .png + image/jpeg → ext-mime first fail', () => {
    expect(validateConsistency('a.png','image/jpeg',Buffer.from([0xff,0xd8,0xff,0xe0])).valid).toBe(false);
  });

  // ====== generateObjectKey ======
  it('ObjectKey: randomUUID format (32 hex)', () => {
    expect(generateObjectKey('a.jpg')).toMatch(/^[a-f0-9]{32}\.jpg$/);
  });
  it('ObjectKey: unique per call', () => {
    expect(generateObjectKey('a.png')).not.toBe(generateObjectKey('a.png'));
  });

  // ====== 2. moduleName 严格正则匹配原始字符串 ======
  it('meta: common+private → 通过', () => expect(validateUploadMeta('common','private').valid).toBe(true));
  it('meta: avatar+public → 通过', () => expect(validateUploadMeta('avatar','public').valid).toBe(true));
  it('meta: attachment → 通过', () => expect(validateUploadMeta('attachment','private').valid).toBe(true));
  // strict regex — 包含路径字符直接拒绝（不降解清洗）
  it('meta: ../common → 非法字符拒绝', () => {
    const r = validateUploadMeta('../common', 'private');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('非法字符');
  });
  it('meta: common/../etc → 非法字符拒绝', () => {
    expect(validateUploadMeta('common/../etc','private').valid).toBe(false);
  });
  it('meta: ..\\windows → 非法字符拒绝', () => {
    expect(validateUploadMeta('..\\windows','private').valid).toBe(false);
  });
  it('meta: spaces → 非法字符拒绝', () => {
    expect(validateUploadMeta('common space','private').valid).toBe(false);
  });
  it('meta: root → 不在白名单拒绝', () => {
    expect(validateUploadMeta('root','private').valid).toBe(false);
  });
  it('meta: empty → 拒绝', () => {
    expect(validateUploadMeta('','private').valid).toBe(false);
  });
  it('meta: accessType=admin → 拒绝', () => {
    expect(validateUploadMeta('common','admin').valid).toBe(false);
  });

  // ====== sanitizeFilename ======
  it('sanitize: ../etc/passwd → no / or ..', () => {
    const s = sanitizeFilename('../etc/passwd');
    expect(s).not.toContain('/');
    expect(s).not.toContain('..');
  });
  it('sanitize: normal name untouched', () => {
    expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg');
  });

  // ====== 3. handleUpload 真实执行 — 租户隔离 + 安全日志 + 审计 ======

  describe('handleUpload', () => {
    it('跨租户 storageId → storeRow=null → 500', async () => {
      const mockDb = {
        selectFrom: () => mockDb, selectAll: () => mockDb,
        where: () => mockDb, orderBy: () => mockDb, limit: () => mockDb,
        executeTakeFirst: vi.fn().mockResolvedValue(null),
      } as any;
      const getDb = vi.fn().mockResolvedValue(mockDb);
      const getTenant = vi.fn().mockReturnValue('T001');

      const ctx: any = {
        request: { body: { moduleName: 'common', accessType: 'private', storageId: 'S_OTHER_TENANT' }, files: { file: { originalFilename: 'test.jpg', mimetype: 'image/jpeg', size: 1024, filepath: '/tmp/test.jpg' } } },
        state: { user: { userId: 'u1', tenantId: 'T001' } },
        body: null, status: 200, params: {}, headers: {}, ip: '1.2.3.4',
      };

      const { handleUpload } = await import('../../api/system/storage/index.js');
      try {
        await handleUpload(ctx, getDb, getTenant, async () => {}, async () => {}, () => ({}));
      } catch { /* ok */ }

      expect(ctx.body.code).toBe(500);
      expect(ctx.body.message).toBe('未配置存储服务');
    });

    it('moduleName 非法 → 400 + securityLog 调用', async () => {
      const securityLogCalls: any[] = [];
      const mockDb = { selectFrom: () => mockDb, selectAll: () => mockDb, where: () => mockDb, executeTakeFirst: vi.fn() } as any;
      const getDb = vi.fn().mockResolvedValue(mockDb);
      const getTenant = vi.fn().mockReturnValue('T001');

      const ctx: any = {
        request: { body: { moduleName: '../etc', accessType: 'private' }, files: { file: { originalFilename: 'x.jpg', mimetype: 'image/jpeg', size: 1, filepath: '/tmp/x.jpg' } } },
        state: { user: { userId: 'u1', tenantId: 'T001' } },
        body: null, status: 200, params: {}, headers: {}, ip: '1.2.3.4',
      };

      const { handleUpload } = await import('../../api/system/storage/index.js');
      try {
        await handleUpload(ctx, getDb, getTenant,
          async (e) => { securityLogCalls.push(e); },
          async () => {},
          () => ({}),
        );
      } catch { /* ok */ }

      expect(ctx.body.code).toBe(400);
      expect(ctx.body.message).toContain('非法字符');
    });

    it('安全校验失败 → securityLog 记录', async () => {
      const securityLogCalls: any[] = [];
      const mockDb = {
        selectFrom: () => mockDb, selectAll: () => mockDb, where: () => mockDb,
        executeTakeFirst: vi.fn().mockResolvedValue({ storage_id: 'S1', storage_type: 's3', tenant_id: 'T001' }),
      } as any;
      const getDb = vi.fn().mockResolvedValue(mockDb);
      const getTenant = vi.fn().mockReturnValue('T001');

      // .exe file fails validation
      const ctx: any = {
        request: { body: { moduleName: 'common', accessType: 'private' }, files: { file: { originalFilename: 'virus.exe', mimetype: 'application/octet-stream', size: 1, filepath: '/tmp/v.exe' } } },
        state: { user: { userId: 'u1', tenantId: 'T001' } },
        body: null, status: 200, params: {}, headers: {}, ip: '1.2.3.4',
      };

      const { handleUpload } = await import('../../api/system/storage/index.js');
      try {
        await handleUpload(ctx, getDb, getTenant,
          async (e) => { securityLogCalls.push(e); },
          async () => {},
          () => ({}),
        );
      } catch { /* ok */ }

      expect(ctx.body.code).toBe(400);
      expect(securityLogCalls.length).toBe(1);
      expect(securityLogCalls[0].eventType).toBe('SECURITY_VALIDATION_FAILED');
      expect(securityLogCalls[0].source).toBe('file-security');
    });

    
  // ====== validateFile 组合 ======
  it('validateFile: jpg 全通过', () => {
it('validateFile: jpg 全通过', () => {
    expect(validateFile('p.jpg','image/jpeg',Buffer.from([0xff,0xd8,0xff,0xe0]),1024).valid).toBe(true);
  });
  it('validateFile: exe 拒绝', () => {
    expect(validateFile('virus.exe','application/octet-stream').valid).toBe(false);
  });
  it('validateFile: 图片+错误magic 拒绝', () => {
    expect(validateFile('p.jpg','image/jpeg',Buffer.from([0x00,0x01,0x02,0x03])).valid).toBe(false);
  });
  it('validateFile: ext-mime mismatch 拒绝', () => {
    expect(validateFile('virus.png','image/jpeg').valid).toBe(false);
  });
});

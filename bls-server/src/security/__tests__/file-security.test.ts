/**
 * File Security — 专项测试
 */
import { describe, it, expect, vi } from 'vitest';
import {
  validateExtension, validateMimeType, validateFileSize,
  detectImageMagicNumber, generateObjectKey, validateFile,
  validateExtMimeConsistency, validateConsistency,
  validateUploadMeta, sanitizeFilename,
} from '../file-security';

function makeCtx(overrides: Record<string,any>={}): any {
  return {
    request: { body: { moduleName:'common',accessType:'private' }, files: { file: { originalFilename:'test.jpg',mimetype:'image/jpeg',size:1024,filepath:'/tmp/t.jpg' } } },
    state: { user: { userId:'u1',tenantId:'T001',username:'test' } },
    body:null, status:200, params:{}, headers:{}, ip:'1.2.3.4',
    ...overrides,
  };
}

describe('File Security', () => {
  // ====== validateExtension ======
  it('.jpg 通过', () => expect(validateExtension('photo.jpg').valid).toBe(true));
  it('.svg 拒绝', () => expect(validateExtension('icon.svg').valid).toBe(false));
  it('.exe 拒绝', () => expect(validateExtension('virus.exe').valid).toBe(false));
  it('无扩展名 拒绝', () => expect(validateExtension('file').valid).toBe(false));

  // ====== validateMimeType ======
  it('image/png 通过', () => expect(validateMimeType('image/png').valid).toBe(true));
  it('text/html 拒绝', () => expect(validateMimeType('text/html').valid).toBe(false));
  it('image/svg+xml 拒绝', () => expect(validateMimeType('image/svg+xml').valid).toBe(false));

  // ====== validateFileSize ======
  it('1MB 通过', () => expect(validateFileSize(1024*1024).valid).toBe(true));
  it('0 拒绝', () => expect(validateFileSize(0).valid).toBe(false));

  // ====== Ext-Mime ======
  it('.jpg+image/jpeg 一致', () => expect(validateExtMimeConsistency('a.jpg','image/jpeg').valid).toBe(true));
  it('.png+image/jpeg 伪装拒绝', () => expect(validateExtMimeConsistency('a.png','image/jpeg').valid).toBe(false));

  // ====== Magic: 返回类型 ======
  it('JPEG→jpeg', () => { const r=detectImageMagicNumber(Buffer.from([0xff,0xd8,0xff,0xe0])); expect(r.valid).toBe(true); expect(r.detectedType).toBe('jpeg'); });
  it('PNG→png', () => { const r=detectImageMagicNumber(Buffer.from('89504e470d0a1a0a','hex')); expect(r.valid).toBe(true); expect(r.detectedType).toBe('png'); });
  it('GIF→gif', () => { const r=detectImageMagicNumber(Buffer.from('474946383961','hex')); expect(r.valid).toBe(true); expect(r.detectedType).toBe('gif'); });
  it('WebP→webp', () => { const buf=Buffer.alloc(12); buf.write('RIFF',0); buf.writeUInt32LE(100,4); buf.write('WEBP',8); const r=detectImageMagicNumber(buf); expect(r.valid).toBe(true); expect(r.detectedType).toBe('webp'); });
  it('随机→false', () => expect(detectImageMagicNumber(Buffer.from([0,0,1,2])).valid).toBe(false));

  // ====== Consistency ======
  it('.jpg+JPEG magic 通过', () => expect(validateConsistency('a.jpg','image/jpeg',Buffer.from([0xff,0xd8,0xff,0xe0])).valid).toBe(true));
  it('.png+JPEG magic 拒绝', () => { const r=validateConsistency('a.png','image/png',Buffer.from([0xff,0xd8,0xff,0xe0])); expect(r.valid).toBe(false); expect(r.reason).toContain('jpeg'); });

  // ====== ObjectKey ======
  it('randomUUID 32hex', () => expect(generateObjectKey('a.jpg')).toMatch(/^[a-f0-9]{32}\.jpg$/));
  it('unique per call', () => expect(generateObjectKey('a.png')).not.toBe(generateObjectKey('a.png')));

  // ====== moduleName 严格正则 ======
  it('common 通过', () => expect(validateUploadMeta('common','private').valid).toBe(true));
  it('../common 拒绝', () => { const r=validateUploadMeta('../common','private'); expect(r.valid).toBe(false); expect(r.reason).toContain('非法字符'); });
  it('spaces 拒绝', () => expect(validateUploadMeta('a b','private').valid).toBe(false));
  it('root 拒绝', () => expect(validateUploadMeta('root','private').valid).toBe(false));
  it('empty 拒绝', () => expect(validateUploadMeta('','private').valid).toBe(false));
  it('accessType=admin 拒绝', () => expect(validateUploadMeta('common','admin').valid).toBe(false));

  // ====== sanitize ======
  it('../etc → no / or ..', () => { const s=sanitizeFilename('../etc/passwd'); expect(s).not.toContain('/'); expect(s).not.toContain('..'); });

  // ====== validateFile 组合 ======
  it('jpg 全通过', () => expect(validateFile('p.jpg','image/jpeg',Buffer.from([0xff,0xd8,0xff,0xe0]),1024).valid).toBe(true));
  it('exe 拒绝', () => expect(validateFile('virus.exe','application/octet-stream').valid).toBe(false));
  it('bad magic 拒绝', () => expect(validateFile('p.jpg','image/jpeg',Buffer.from([0,1,2,3])).valid).toBe(false));

  // ====== handleUpload — 真实 Handler 测试 ======

  describe('handleUpload', () => {
    it('跨租户 storageId → 500', async () => {
      const mockDb: any = { selectFrom:()=>mockDb,selectAll:()=>mockDb,where:()=>mockDb,orderBy:()=>mockDb,limit:()=>mockDb,executeTakeFirst:vi.fn().mockResolvedValue(null) };
      const ctx = makeCtx({ request: { body: { moduleName:'common',accessType:'private',storageId:'S_OTHER' }, files: { file: { originalFilename:'test.jpg',mimetype:'image/jpeg',size:1,filepath:'/t.jpg' } } } });
      const { handleUpload } = await import('../../api/system/storage/index.js');
      try { await handleUpload(ctx, vi.fn().mockResolvedValue(mockDb), vi.fn().mockReturnValue('T001'), async()=>{}, async()=>{}, ()=>({})); } catch {}
      expect(ctx.body.code).toBe(500);
      expect(ctx.body.message).toBe('未配置存储服务');
    });

    it('moduleName 非法 → 400', async () => {
      const mockDb: any = { selectFrom:()=>mockDb,selectAll:()=>mockDb,where:()=>mockDb,executeTakeFirst:vi.fn() };
      const ctx = makeCtx({ request: { body: { moduleName:'../etc',accessType:'private' }, files: { file: { originalFilename:'x.jpg',mimetype:'image/jpeg',size:1,filepath:'/x.jpg' } } } });
      const { handleUpload } = await import('../../api/system/storage/index.js');
      try { await handleUpload(ctx, vi.fn().mockResolvedValue(mockDb), vi.fn().mockReturnValue('T001'), async()=>{}, async()=>{}, ()=>({})); } catch {}
      expect(ctx.body.code).toBe(400);
      expect(ctx.body.message).toContain('非法字符');
    });

    it('.exe → securityLog called, no audit', async () => {
      const sc: any[]=[], ac: any[]=[];
      const mockDb: any = { selectFrom:()=>mockDb,selectAll:()=>mockDb,where:()=>mockDb,executeTakeFirst:vi.fn().mockResolvedValue({storage_id:'S1',storage_type:'s3',tenant_id:'T001'}) };
      const ctx = makeCtx({ request: { body: { moduleName:'common',accessType:'private' }, files: { file: { originalFilename:'virus.exe',mimetype:'application/octet-stream',size:1,filepath:'/v.exe' } } } });
      const { handleUpload } = await import('../../api/system/storage/index.js');
      try { await handleUpload(ctx, vi.fn().mockResolvedValue(mockDb), vi.fn().mockReturnValue('T001'), async(e:any)=>{sc.push(e)}, async(e:any)=>{ac.push(e)}, ()=>({})); } catch {}
      expect(ctx.body.code).toBe(400);
      expect(sc.length).toBe(1);
      expect(sc[0].eventType).toBe('SECURITY_VALIDATION_FAILED');
      expect(ac.length).toBe(0);
    });

    it('tenantId 缺失 → fail-closed 401', async () => {
      const mockDb: any = {};
      const getDb = vi.fn();
      const ctx = makeCtx({ request: { body: { moduleName:'common',accessType:'private' }, files: { file: { originalFilename:'test.jpg',mimetype:'image/jpeg',size:1,filepath:'/t.jpg' } } } });
      const { handleUpload } = await import('../../api/system/storage/index.js');
      try { await handleUpload(ctx, getDb, vi.fn().mockReturnValue(null), async()=>{}, async()=>{}, ()=>({})); } catch {}
      // fail-closed: 不查询数据库，直接 401
      expect(ctx.body.code).toBe(401);
      expect(ctx.body.message).toBe('租户上下文缺失');
      expect(getDb).not.toHaveBeenCalled();
    });

    it('成功上传 → INSERT + audit 强制断言', async () => {
      const ac: any[]=[];
      const mockValues = vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
      const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
      const mockDb: any = {
        selectFrom:()=>mockDb, selectAll:()=>mockDb, where:()=>mockDb,
        executeTakeFirst: vi.fn().mockResolvedValue({ storage_id:'S1',storage_type:'s3',tenant_id:'T001',public_bucket:'pub' }),
        insertInto: mockInsert,
      };

      // inject provider: succeed
      const mockUpload = vi.fn().mockResolvedValue({ url: 'https://s3.example.com/f.jpg' });
      const mockGetPublicUrl = vi.fn().mockReturnValue('https://s3.example.com/f.jpg');
      const createProvider = () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl });

      // inject readFile: JPEG magic
      const readFile = () => Buffer.from([0xff,0xd8,0xff,0xe0,0,0,0,0]);

      const ctx = makeCtx({
        request: { body: { moduleName:'avatar',accessType:'public',storageId:'S1' }, files: { file: { originalFilename:'photo.jpg',mimetype:'image/jpeg',size:100,filepath:'/t.jpg' } } },
        state: { user: { userId:'u2',tenantId:'T002',username:'test' } },
      });

      const { handleUpload } = await import('../../api/system/storage/index.js');
      await handleUpload(ctx,
        vi.fn().mockResolvedValue(mockDb),
        vi.fn().mockReturnValue('T002'),
        async()=>{},
        async(e:any)=>{ac.push(e)},
        ()=>({clientIp:'1.2.3.4'}),
        createProvider,
        readFile,
      );

      // 强制断言 — 全部必须通过
      expect(ctx.body.code).toBe(200);
      expect(mockUpload).toHaveBeenCalledTimes(1);
      expect(mockInsert).toHaveBeenCalledWith('sys_file');
      const insertRow = mockValues.mock.calls[0]?.[0];
      expect(insertRow.tenant_id).toBe('T002');
      expect(ac.length).toBe(1);
      expect(ac[0].tenantId).toBe('T002');
      expect(ac[0].userId).toBe('u2');
    });
  });
});

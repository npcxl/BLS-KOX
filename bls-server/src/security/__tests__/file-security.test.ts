/**
 * P13: File Security — 专项测试 (FIX-02/03/04/05)
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
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
  it('.pdf 通过', () => expect(validateExtension('doc.pdf').valid).toBe(true));
  it('.webp 通过', () => expect(validateExtension('img.webp').valid).toBe(true));
  it('.exe 拒绝', () => expect(validateExtension('virus.exe').valid).toBe(false));
  it('.sh 拒绝', () => expect(validateExtension('script.sh').valid).toBe(false));
  it('.svg 拒绝 (P13-FIX-03)', () => expect(validateExtension('icon.svg').valid).toBe(false));
  it('无扩展名 拒绝', () => expect(validateExtension('file').valid).toBe(false));

  // ====== validateMimeType ======
  it('image/png 通过', () => expect(validateMimeType('image/png').valid).toBe(true));
  it('image/webp 通过', () => expect(validateMimeType('image/webp').valid).toBe(true));
  it('application/pdf 通过', () => expect(validateMimeType('application/pdf').valid).toBe(true));
  it('text/html 拒绝', () => expect(validateMimeType('text/html').valid).toBe(false));
  it('image/svg+xml 拒绝 (P13-FIX-03)', () => expect(validateMimeType('image/svg+xml').valid).toBe(false));

  // ====== validateFileSize ======
  it('1MB 通过', () => expect(validateFileSize(1024*1024).valid).toBe(true));
  it('0 拒绝', () => expect(validateFileSize(0).valid).toBe(false));
  it('200MB 拒绝', () => expect(validateFileSize(200*1024*1024).valid).toBe(false));

  // ====== FIX-02: Ext-MIME consistency ======
  it('ext-mime: .jpg + image/jpeg 一致', () => {
    expect(validateExtMimeConsistency('a.jpg', 'image/jpeg').valid).toBe(true);
  });
  it('ext-mime: .png + image/jpeg 不一致 (伪装)', () => {
    expect(validateExtMimeConsistency('a.png', 'image/jpeg').valid).toBe(false);
  });
  it('ext-mime: .jpg + application/pdf 伪装拒绝', () => {
    expect(validateExtMimeConsistency('a.jpg', 'application/pdf').valid).toBe(false);
  });

  // ====== detectImageMagicNumber ======
  it('JPEG(ffd8ff) 通过', () => {
    expect(detectImageMagicNumber(Buffer.from([0xff,0xd8,0xff,0xe0])).valid).toBe(true);
  });
  it('PNG(89504e47) 通过', () => {
    expect(detectImageMagicNumber(Buffer.from('89504e470d0a1a0a', 'hex')).valid).toBe(true);
  });
  it('GIF(47494638) 通过', () => {
    expect(detectImageMagicNumber(Buffer.from('474946383961', 'hex')).valid).toBe(true);
  });
  it('WebP(RIFF????WEBP) 通过 (FIX-04)', () => {
    const buf = Buffer.alloc(12);
    buf.write('RIFF', 0); buf.writeUInt32LE(100, 4); buf.write('WEBP', 8);
    expect(detectImageMagicNumber(buf).valid).toBe(true);
  });
  it('WebP: 只有 RIFF 没有 WEBP 拒绝 (FIX-04)', () => {
    const buf = Buffer.alloc(12);
    buf.write('RIFF', 0);
    expect(detectImageMagicNumber(buf).valid).toBe(false);
  });
  it('随机内容 拒绝', () => {
    expect(detectImageMagicNumber(Buffer.from([0x00,0x01,0x02,0x03])).valid).toBe(false);
  });

  // ====== FIX-02: consistency (ext + mime + magic) ======
  it('consistency: .jpg + image/jpeg + JPEG magic → 通过', () => {
    const buf = Buffer.from([0xff,0xd8,0xff,0xe0]);
    expect(validateConsistency('a.jpg', 'image/jpeg', buf).valid).toBe(true);
  });
  it('consistency: .png + image/jpeg + PNG magic → 类型伪装拒绝', () => {
    const buf = Buffer.from('89504e470d0a1a0a', 'hex');
    // ext=.png but mime=image/jpeg → fails ext-mime check first
    expect(validateConsistency('a.png', 'image/jpeg', buf).valid).toBe(false);
  });

  // ====== generateObjectKey (FIX-04: randomUUID) ======
  it('ObjectKey: randomUUID format', () => {
    const key = generateObjectKey('photo.jpg');
    expect(key).toMatch(/^[a-f0-9]{32}\.jpg$/);
  });
  it('ObjectKey: 相同文件名不同输出', () => {
    expect(generateObjectKey('a.png')).not.toBe(generateObjectKey('a.png'));
  });

  // ====== FIX-04: moduleName / accessType ======
  it('validateUploadMeta: common+private 通过', () => {
    expect(validateUploadMeta('common', 'private').valid).toBe(true);
  });
  it('validateUploadMeta: avatar+public 通过', () => {
    expect(validateUploadMeta('avatar', 'public').valid).toBe(true);
  });
  it('validateUploadMeta: evil 拒绝', () => {
    expect(validateUploadMeta('root', 'private').valid).toBe(false);
  });
  it('validateUploadMeta: ../ 路径穿越拒绝', () => {
    expect(validateUploadMeta('../etc', 'private').valid).toBe(false);
  });
  it('validateUploadMeta: accessType=admin 拒绝', () => {
    expect(validateUploadMeta('common', 'admin').valid).toBe(false);
  });

  // ====== FIX-04: sanitizeFilename ======
  it('sanitizeFilename: ../etc/passwd → __etc_passwd', () => {
    expect(sanitizeFilename('../etc/passwd')).not.toContain('/');
    expect(sanitizeFilename('../etc/passwd')).not.toContain('..');
  });
  it('sanitizeFilename: normal name untouched', () => {
    expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg');
  });

  // ====== validateFile 组合 ======
  it('validateFile: jpg 全通过', () => {
    const buf = Buffer.from([0xff,0xd8,0xff,0xe0]);
    expect(validateFile('p.jpg', 'image/jpeg', buf, 1024).valid).toBe(true);
  });
  it('validateFile: exe 拒绝', () => {
    expect(validateFile('virus.exe', 'application/octet-stream').valid).toBe(false);
  });
  it('validateFile: 图片+错误magic 拒绝', () => {
    expect(validateFile('p.jpg', 'image/jpeg', Buffer.from([0x00,0x01,0x02,0x03])).valid).toBe(false);
  });
  it('validateFile: ext-mime mismatch 拒绝', () => {
    expect(validateFile('virus.png', 'image/jpeg').valid).toBe(false);
  });
});

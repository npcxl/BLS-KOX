/**
 * P13: File Security — 专项测试
 */
import { describe, it, expect } from 'vitest';
import {
  validateExtension, validateMimeType, validateFileSize,
  detectImageMagicNumber, generateObjectKey, validateFile,
} from '../file-security';

describe('P13 File Security', () => {
  // ====== validateExtension ======
  it('validateExtension: .jpg 通过', () => expect(validateExtension('photo.jpg').valid).toBe(true));
  it('validateExtension: .png 通过', () => expect(validateExtension('icon.png').valid).toBe(true));
  it('validateExtension: .pdf 通过', () => expect(validateExtension('doc.pdf').valid).toBe(true));
  it('validateExtension: .exe 拒绝', () => expect(validateExtension('virus.exe').valid).toBe(false));
  it('validateExtension: .sh 拒绝', () => expect(validateExtension('script.sh').valid).toBe(false));
  it('validateExtension: 无扩展名 拒绝', () => expect(validateExtension('file').valid).toBe(false));

  // ====== validateMimeType ======
  it('validateMimeType: image/png 通过', () => expect(validateMimeType('image/png').valid).toBe(true));
  it('validateMimeType: application/pdf 通过', () => expect(validateMimeType('application/pdf').valid).toBe(true));
  it('validateMimeType: text/html 拒绝', () => expect(validateMimeType('text/html').valid).toBe(false));

  // ====== validateFileSize ======
  it('validateFileSize: 1MB 通过', () => expect(validateFileSize(1024 * 1024).valid).toBe(true));
  it('validateFileSize: 0 拒绝', () => expect(validateFileSize(0).valid).toBe(false));
  it('validateFileSize: 200MB 拒绝', () => expect(validateFileSize(200 * 1024 * 1024).valid).toBe(false));

  // ====== detectImageMagicNumber ======
  it('detectImageMagicNumber: JPEG(ffd8ff) 通过', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectImageMagicNumber(buf).valid).toBe(true);
  });
  it('detectImageMagicNumber: PNG(89504e47) 通过', () => {
    const buf = Buffer.from('89504e470d0a1a0a', 'hex');
    expect(detectImageMagicNumber(buf).valid).toBe(true);
  });
  it('detectImageMagicNumber: 随机内容 拒绝', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(detectImageMagicNumber(buf).valid).toBe(false);
  });

  // ====== generateObjectKey ======
  it('generateObjectKey: 生成随机 key', () => {
    const key = generateObjectKey('photo.jpg');
    expect(key).toMatch(/^[a-f0-9]{16}\.jpg$/);
  });
  it('generateObjectKey: 相同文件名产生不同 key', () => {
    const k1 = generateObjectKey('a.png');
    const k2 = generateObjectKey('a.png');
    expect(k1).not.toBe(k2);
  });

  // ====== validateFile 组合校验 ======
  it('validateFile: jpg 通过', () => {
    expect(validateFile('p.jpg', 'image/jpeg').valid).toBe(true);
  });
  it('validateFile: exe 拒绝', () => {
    expect(validateFile('virus.exe', 'application/octet-stream').valid).toBe(false);
  });
  it('validateFile: 图片+正确magic 通过', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(validateFile('p.jpg', 'image/jpeg', buf).valid).toBe(true);
  });
  it('validateFile: 图片+错误magic 拒绝', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(validateFile('p.jpg', 'image/jpeg', buf).valid).toBe(false);
  });
  it('validateFile: pdf + 大小通过', () => {
    expect(validateFile('doc.pdf', 'application/pdf', undefined, 1024).valid).toBe(true);
  });
  it('validateFile: pdf + 大小超限', () => {
    expect(validateFile('doc.pdf', 'application/pdf', undefined, 200 * 1024 * 1024).valid).toBe(false);
  });
});

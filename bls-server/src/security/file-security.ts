/**
 * P13: 文件安全模块
 */
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../core/logger';

const ALLOWED_EXT = new Set(['.jpg','.jpeg','.png','.gif','.webp','.pdf','.doc','.docx','.xls','.xlsx','.txt','.csv','.json','.zip']);
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv','application/json','application/zip']);
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// P13-FIX-04: 完整 Magic Number 检测（WebP 需要 12 bytes RIFF....WEBP）
const IMAGE_SIGNATURES: { hex: string; len: number; type: string }[] = [
  { hex: 'ffd8ff',    len: 3, type: 'jpeg' },
  { hex: '89504e47',  len: 4, type: 'png' },
  { hex: '47494638',  len: 4, type: 'gif' },
  { hex: '52494646',  len: 12, type: 'webp' }, // RIFF????WEBP
];
const ALLOWED_IMG_TYPES = new Set(['jpeg', 'png', 'gif', 'webp']);

// P13-FIX-03: SVG disabled by default
const ALLOWED_MODULES = new Set(['common', 'avatar', 'attachment', 'import', 'export', 'public', 'private']);
const ALLOWED_ACCESS = new Set(['public', 'private']);

// ext → expected MIME prefix
const EXT_MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.txt': 'text/plain',
  '.csv': 'text/csv', '.json': 'application/json',
  '.zip': 'application/zip',
};

export interface FileSecurityResult { valid: boolean; reason?: string }

export function validateExtension(filename: string): FileSecurityResult {
  const ext = extname(filename).toLowerCase();
  if (!ext) return { valid: false, reason: '缺少文件扩展名' };
  return ALLOWED_EXT.has(ext) ? { valid: true } : { valid: false, reason: `不允许的文件类型: ${ext}` };
}

export function validateMimeType(mimeType: string): FileSecurityResult {
  return ALLOWED_MIME.has(mimeType) ? { valid: true } : { valid: false, reason: `不允许的 MIME: ${mimeType}` };
}

export function validateFileSize(size: number, maxSize = MAX_FILE_SIZE): FileSecurityResult {
  if (size <= 0) return { valid: false, reason: '文件大小为0或无效' };
  if (size > maxSize) return { valid: false, reason: `文件超过最大限制 ${Math.round(maxSize/1024/1024)}MB` };
  return { valid: true };
}

// P13-FIX-02: 扩展名 ↔ MIME 一致性检查
export function validateExtMimeConsistency(filename: string, mimeType: string): FileSecurityResult {
  const ext = extname(filename).toLowerCase();
  const expected = EXT_MIME_MAP[ext];
  if (!expected) return { valid: true }; // non-image, skip
  if (mimeType !== expected) {
    return { valid: false, reason: `MIME 类型与扩展名不匹配: ${ext} → ${mimeType} (期望 ${expected})` };
  }
  return { valid: true };
}

// P13-FIX-04: Magic Number → type + WebP 完整签名
export function detectImageMagicNumber(buffer: Buffer): FileSecurityResult {
  const hex12 = buffer.slice(0, 12).toString('hex');
  for (const sig of IMAGE_SIGNATURES) {
    const part = hex12.slice(0, sig.len * 2);
    if (sig.type === 'webp') {
      // P13-FIX-04: RIFF + WEBP (bytes 0-3=RIFF, 8-11=WEBP)
      if (hex12.slice(0, 8) === '52494646' && hex12.slice(16, 24) === '57454250') {
        return { valid: true };
      }
    } else if (part.startsWith(sig.hex)) {
      return { valid: true };
    }
  }
  logger.warn('[file-security] blocked: unknown magic', { hex: hex12.slice(0, 16) });
  return { valid: false, reason: '文件内容与扩展名不匹配' };
}

// P13-FIX-02: 扩展名 + MIME + Magic Number 三者一致性
export function validateConsistency(filename: string, mimeType: string, buffer: Buffer): FileSecurityResult {
  const r = validateExtMimeConsistency(filename, mimeType);
  if (!r.valid) return r;
  // 图片才检查 magic
  if (mimeType.startsWith('image/')) return detectImageMagicNumber(buffer);
  return { valid: true };
}

// P13-FIX-04: randomUUID Object Key
export function generateObjectKey(originalName: string): string {
  return randomUUID().replace(/-/g, '') + extname(originalName);
}

// P13-FIX-04: validate moduleName + accessType
export function validateUploadMeta(moduleName: string, accessType: string): FileSecurityResult {
  const cleanModule = (moduleName || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanModule || !ALLOWED_MODULES.has(cleanModule)) {
    return { valid: false, reason: `不允许的模块名: ${moduleName}` };
  }
  if (!ALLOWED_ACCESS.has(accessType)) {
    return { valid: false, reason: `不允许的访问类型: ${accessType}` };
  }
  return { valid: true };
}

// P13-FIX-04: 路径穿越防护
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\:*?"<>|]/g, '_').replace(/\.\./g, '_');
}

export function validateFile(filename: string, mimeType: string, buffer?: Buffer, fileSize?: number): FileSecurityResult {
  let r = validateExtension(filename); if (!r.valid) return r;
  r = validateMimeType(mimeType); if (!r.valid) return r;
  r = validateExtMimeConsistency(filename, mimeType); if (!r.valid) return r;
  if (fileSize !== undefined) { r = validateFileSize(fileSize); if (!r.valid) return r; }
  if (buffer) return validateConsistency(filename, mimeType, buffer);
  return { valid: true };
}

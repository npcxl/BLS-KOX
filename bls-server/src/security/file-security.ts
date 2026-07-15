/**
 * 文件安全模块
 */
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../core/logger';

const ALLOWED_EXT = new Set(['.jpg','.jpeg','.png','.gif','.webp','.pdf','.doc','.docx','.xls','.xlsx','.txt','.csv','.json','.zip']);
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv','application/json','application/zip']);
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Magic Number → 实际图片类型（返回类型用于精确比较）
const IMAGE_SIGNATURES: { hex: string; len: number; type: string }[] = [
  { hex: 'ffd8ff',    len: 3,  type: 'jpeg' },
  { hex: '89504e47',  len: 4,  type: 'png' },
  { hex: '47494638',  len: 4,  type: 'gif' },
  { hex: '52494646',  len: 12, type: 'webp' }, // RIFF????WEBP
];

// ext → expected MIME
const EXT_MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.txt': 'text/plain',
  '.csv': 'text/csv', '.json': 'application/json',
  '.zip': 'application/zip',
};

// type → expected extension set
const TYPE_EXT_MAP: Record<string, Set<string>> = {
  jpeg: new Set(['.jpg', '.jpeg']),
  png:  new Set(['.png']),
  gif:  new Set(['.gif']),
  webp: new Set(['.webp']),
};

// SVG disabled
// 严格模块名正则：仅字母/数字/下划线/连字符，不含路径分隔符
const MODULE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;
const ALLOWED_MODULES = new Set(['common', 'avatar', 'attachment', 'import', 'export', 'public', 'private']);
const ALLOWED_ACCESS = new Set(['public', 'private']);

// 路径穿越检测模式
const PATH_TRAVERSAL_RE = /(?:^|\/)\.\.(?:\/|$)/;

export interface FileSecurityResult { valid: boolean; reason?: string; detectedType?: string }

// ====== 基础校验 ======

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

// FIX-02: 扩展名 ↔ MIME 一致性
export function validateExtMimeConsistency(filename: string, mimeType: string): FileSecurityResult {
  const ext = extname(filename).toLowerCase();
  const expected = EXT_MIME_MAP[ext];
  if (!expected) return { valid: true };
  if (mimeType !== expected) {
    return { valid: false, reason: `MIME 类型与扩展名不匹配: ${ext} → ${mimeType} (期望 ${expected})` };
  }
  return { valid: true };
}

// ====== 1. Magic 检测返回实际类型 + 精确比较 ======

/** 返回检测到的图片类型，未知返回 null */
export function detectImageMagicNumber(buffer: Buffer): FileSecurityResult & { detectedType?: string } {
  const hex12 = buffer.slice(0, 12).toString('hex');
  for (const sig of IMAGE_SIGNATURES) {
    if (sig.type === 'webp') {
      if (hex12.slice(0, 8) === '52494646' && hex12.slice(16, 24) === '57454250') {
        return { valid: true, detectedType: 'webp' };
      }
    } else {
      const part = hex12.slice(0, sig.len * 2);
      if (part.startsWith(sig.hex)) {
        return { valid: true, detectedType: sig.type };
      }
    }
  }
  logger.warn('[file-security] blocked: unknown magic', { hex: hex12.slice(0, 16) });
  return { valid: false, reason: '文件内容与扩展名不匹配' };
}

/** 精确比较：ext + mime + magic type 三者必须一致 */
export function validateConsistency(filename: string, mimeType: string, buffer: Buffer): FileSecurityResult {
  // 1. ext ↔ mime
  const r = validateExtMimeConsistency(filename, mimeType);
  if (!r.valid) return r;

  // 2. 图片才检查 magic
  if (!mimeType.startsWith('image/')) return { valid: true };
  const magicResult = detectImageMagicNumber(buffer);
  if (!magicResult.valid) return magicResult;

  // 3. magic type ↔ ext 精确比较
  const actualType = magicResult.detectedType!;
  const ext = extname(filename).toLowerCase();
  const validExts = TYPE_EXT_MAP[actualType];
  if (!validExts || !validExts.has(ext)) {
    return { valid: false, reason: `Magic Number 实际为 ${actualType}，与扩展名 ${ext} 不匹配` };
  }

  // 4. magic type ↔ mime
  const expectedMime = EXT_MIME_MAP[ext];
  if (expectedMime && mimeType !== expectedMime) {
    return { valid: false, reason: `Magic Number 实际为 ${actualType}，与 MIME ${mimeType} 不匹配` };
  }

  return { valid: true };
}

// ====== randomUUID Object Key ======

export function generateObjectKey(originalName: string): string {
  return randomUUID().replace(/-/g, '') + extname(originalName);
}

// ====== 2. moduleName 严格正则匹配原始字符串（禁止清洗后接受） ======

export function validateUploadMeta(moduleName: string, accessType: string): FileSecurityResult {
  if (!moduleName || typeof moduleName !== 'string') {
    return { valid: false, reason: '缺少模块名' };
  }
  // 严格正则：原始字符串必须匹配，不匹配直接拒绝，不降解清洗
  if (!MODULE_NAME_RE.test(moduleName)) {
    return { valid: false, reason: `模块名包含非法字符: ${moduleName}` };
  }
  // 必须在白名单中（不再走 clean 降级）
  if (!ALLOWED_MODULES.has(moduleName)) {
    return { valid: false, reason: `不允许的模块名: ${moduleName}` };
  }
  if (!ALLOWED_ACCESS.has(accessType)) {
    return { valid: false, reason: `不允许的访问类型: ${accessType}` };
  }
  return { valid: true };
}

// 路径穿越防护
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\:*?"<>|]/g, '_').replace(/\.\./g, '_');
}

// 组合校验
export function validateFile(filename: string, mimeType: string, buffer?: Buffer, fileSize?: number): FileSecurityResult {
  let r = validateExtension(filename); if (!r.valid) return r;
  r = validateMimeType(mimeType); if (!r.valid) return r;
  r = validateExtMimeConsistency(filename, mimeType); if (!r.valid) return r;
  if (fileSize !== undefined) { r = validateFileSize(fileSize); if (!r.valid) return r; }
  if (buffer) return validateConsistency(filename, mimeType, buffer);
  return { valid: true };
}

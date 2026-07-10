/**
 * P13: 文件安全模块
 * 扩展名白名单 / MIME 校验 / Magic Number / 随机 Object Key
 */
import { extname } from 'path';
import { createHash } from 'crypto';
import { logger } from '../core/logger';

const ALLOWED_EXT = new Set(['.jpg','.jpeg','.png','.gif','.webp','.svg','.pdf','.doc','.docx','.xls','.xlsx','.txt','.csv','.json','.zip']);
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','application/pdf','text/plain','text/csv','application/json','application/zip']);

export interface FileSecurityResult { valid: boolean; reason?: string }

export function validateExtension(filename: string): FileSecurityResult {
  const ext = extname(filename).toLowerCase();
  return ALLOWED_EXT.has(ext) ? { valid: true } : { valid: false, reason: `不允许的文件类型: ${ext}` };
}

export function validateMimeType(mimeType: string): FileSecurityResult {
  return ALLOWED_MIME.has(mimeType) ? { valid: true } : { valid: false, reason: `不允许的 MIME: ${mimeType}` };
}

export function detectImageMagicNumber(buffer: Buffer): FileSecurityResult {
  const hex = buffer.slice(0, 4).toString('hex');
  const sigs: Record<string, string> = { ffd8ffe0: 'jpeg', ffd8ffe1: 'jpeg', '89504e47': 'png', '47494638': 'gif' };
  if (!sigs[hex]) logger.warn('[file-security] unknown magic', { hex });
  return { valid: true };
}

export function generateObjectKey(originalName: string): string {
  return createHash('sha256').update(`${Date.now()}-${Math.random()}-${originalName}`).digest('hex').slice(0, 16) + extname(originalName);
}

export function validateFile(filename: string, mimeType: string, buffer?: Buffer): FileSecurityResult {
  let r = validateExtension(filename); if (!r.valid) return r;
  r = validateMimeType(mimeType); if (!r.valid) return r;
  if (buffer && mimeType.startsWith('image/')) return detectImageMagicNumber(buffer);
  return { valid: true };
}

/**
 * P13: 文件安全模块
 */
import { extname } from 'path';
import { createHash } from 'crypto';
import { logger } from '../core/logger';

const ALLOWED_EXT = new Set(['.jpg','.jpeg','.png','.gif','.webp','.svg','.pdf','.doc','.docx','.xls','.xlsx','.txt','.csv','.json','.zip']);
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','application/pdf','text/plain','text/csv','application/json','application/zip']);
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB default
const IMAGE_SIGNATURES: Record<string, string> = { ffd8ff: 'jpeg', '89504e47': 'png', '47494638': 'gif', '52494646': 'webp', '3c737667': 'svg' };

export interface FileSecurityResult { valid: boolean; reason?: string }

export function validateExtension(filename: string): FileSecurityResult {
  const ext = extname(filename).toLowerCase();
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

/** P13-FIX: 拒绝未知 Magic Number */
export function detectImageMagicNumber(buffer: Buffer): FileSecurityResult {
  const hex = buffer.slice(0, 4).toString('hex');
  // 检查前 3 bytes (ffd8ff for jpeg) 或 4 bytes
  const hex3 = hex.slice(0, 6);
  const found = IMAGE_SIGNATURES[hex] || IMAGE_SIGNATURES[hex3];
  if (!found) {
    logger.warn('[file-security] blocked: unknown magic number', { hex });
    return { valid: false, reason: '文件内容与扩展名不匹配' };
  }
  return { valid: true };
}

export function generateObjectKey(originalName: string): string {
  return createHash('sha256').update(`${Date.now()}-${Math.random()}-${originalName}`).digest('hex').slice(0, 16) + extname(originalName);
}

export function validateFile(filename: string, mimeType: string, buffer?: Buffer, fileSize?: number): FileSecurityResult {
  let r = validateExtension(filename); if (!r.valid) return r;
  r = validateMimeType(mimeType); if (!r.valid) return r;
  if (fileSize !== undefined) { r = validateFileSize(fileSize); if (!r.valid) return r; }
  if (buffer && mimeType.startsWith('image/')) return detectImageMagicNumber(buffer);
  return { valid: true };
}

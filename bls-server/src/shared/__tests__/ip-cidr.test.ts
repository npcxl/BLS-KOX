/**
 * 阶段七：IP / CIDR 匹配测试
 *
 * 重点回归：旧实现用 `ip.startsWith('10.')` 前缀匹配，会把 `10.` 误当作 CIDR。
 */
import { describe, it, expect } from 'vitest';
import { isIpInCidr, isIpAllowed, normalizeIp, parseAllowlist, isValidCidrOrIp } from '../utils/ip-cidr';

describe('normalizeIp', () => {
  it('去除 IPv4-mapped IPv6 前缀', () => {
    expect(normalizeIp('::ffff:10.1.2.3')).toBe('10.1.2.3');
    expect(normalizeIp(' 10.1.2.3 ')).toBe('10.1.2.3');
    expect(normalizeIp(undefined)).toBe('');
  });
});

describe('isIpInCidr', () => {
  it('10.0.0.0/8 命中 10.x 网段', () => {
    expect(isIpInCidr('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(isIpInCidr('10.255.255.255', '10.0.0.0/8')).toBe(true);
  });

  it('10.0.0.0/8 不匹配边界外地址', () => {
    expect(isIpInCidr('11.0.0.1', '10.0.0.0/8')).toBe(false);
    expect(isIpInCidr('110.1.2.3', '10.0.0.0/8')).toBe(false);
    expect(isIpInCidr('100.64.0.1', '10.0.0.0/8')).toBe(false);
  });

  it('172.16.0.0/12 精确覆盖 Docker 网段', () => {
    expect(isIpInCidr('172.16.0.5', '172.16.0.0/12')).toBe(true);
    expect(isIpInCidr('172.31.255.254', '172.16.0.0/12')).toBe(true);
    expect(isIpInCidr('172.32.0.1', '172.16.0.0/12')).toBe(false);
    expect(isIpInCidr('172.15.0.1', '172.16.0.0/12')).toBe(false);
  });

  it('192.168.0.0/16 与 /32 单主机', () => {
    expect(isIpInCidr('192.168.1.20', '192.168.0.0/16')).toBe(true);
    expect(isIpInCidr('192.169.0.1', '192.168.0.0/16')).toBe(false);
    expect(isIpInCidr('192.168.1.20', '192.168.1.20')).toBe(true);
    expect(isIpInCidr('192.168.1.21', '192.168.1.20')).toBe(false);
  });

  it('回环地址 127.0.0.0/8', () => {
    expect(isIpInCidr('127.0.0.1', '127.0.0.0/8')).toBe(true);
    expect(isIpInCidr('128.0.0.1', '127.0.0.0/8')).toBe(false);
  });

  it('IPv6 前缀匹配', () => {
    expect(isIpInCidr('::1', '::1/128')).toBe(true);
    expect(isIpInCidr('2001:db8::5', '2001:db8::/32')).toBe(true);
    expect(isIpInCidr('2001:db9::5', '2001:db8::/32')).toBe(false);
  });

  it('非法输入返回 false 而不是抛错', () => {
    expect(isIpInCidr('not-an-ip', '10.0.0.0/8')).toBe(false);
    expect(isIpInCidr('10.1.2.3', 'abc/8')).toBe(false);
    expect(isIpInCidr('10.1.2.3', '10.0.0.0/99')).toBe(false);
    expect(isIpInCidr('', '10.0.0.0/8')).toBe(false);
  });

  it('回归：旧的字符串前缀匹配不再生效', () => {
    // 旧实现下 '10.' 会匹配 '10.' 开头的任意字符串（含非 IP）
    expect(isIpInCidr('10.evil.example.com', '10.')).toBe(false);
    expect(isIpInCidr('10.1.2.3', '10.')).toBe(false);
  });
});

describe('isIpAllowed / parseAllowlist / isValidCidrOrIp', () => {
  it('allowlist 为空 → fail-closed', () => {
    expect(isIpAllowed('10.1.2.3', [])).toBe(false);
  });

  it('命中任意条目即放行', () => {
    const list = ['127.0.0.0/8', '10.0.0.0/8', '192.168.0.0/16'];
    expect(isIpAllowed('10.5.5.5', list)).toBe(true);
    expect(isIpAllowed('8.8.8.8', list)).toBe(false);
  });

  it('parseAllowlist 使用 fallback', () => {
    expect(parseAllowlist('', ['10.0.0.0/8'])).toEqual(['10.0.0.0/8']);
    expect(parseAllowlist('1.2.3.4, 5.6.7.8', ['10.0.0.0/8'])).toEqual(['1.2.3.4', '5.6.7.8']);
  });

  it('isValidCidrOrIp 校验配置项', () => {
    expect(isValidCidrOrIp('10.0.0.0/8')).toBe(true);
    expect(isValidCidrOrIp('10.0.0.1')).toBe(true);
    expect(isValidCidrOrIp('10.0.0.0/33')).toBe(false);
    expect(isValidCidrOrIp('10.')).toBe(false);
    expect(isValidCidrOrIp('')).toBe(false);
    expect(isValidCidrOrIp('::1/128')).toBe(true);
  });
});

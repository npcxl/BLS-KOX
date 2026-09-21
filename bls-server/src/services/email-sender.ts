/**
 * 邮件发送抽象（阶段四）
 *
 * 这是**预留接口**：仓库里没有配置任何 SMTP/第三方邮件通道。
 * `LogOnlyEmailSender` 只记录一条结构化日志并明确返回 `delivered: false` +
 * `EMAIL_TRANSPORT_NOT_CONFIGURED`，**不会**假装发送成功。
 *
 * 接入真实通道时实现 `EmailSender` 并替换导出的 `emailSender` 即可。
 */
import { logger } from '../core/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailDeliveryResult {
  delivered: boolean;
  channel: string;
  reason?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailDeliveryResult>;
}

class LogOnlyEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    logger.warn('[email] no transport configured, email suppressed', {
      to: message.to,
      subject: message.subject,
      reason: 'EMAIL_TRANSPORT_NOT_CONFIGURED',
    });
    return { delivered: false, channel: 'none', reason: 'EMAIL_TRANSPORT_NOT_CONFIGURED' };
  }
}

export const emailSender: EmailSender = new LogOnlyEmailSender();

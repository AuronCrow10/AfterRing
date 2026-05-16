// src/services/email.service.ts
import nodemailer from 'nodemailer';
import type { Client, IntakeLead, CallSession } from '@prisma/client';
import logger from '../config/logger';
import { env } from '../config/env';

class EmailService {
  private transporter = nodemailer.createTransport({
    host: env.MAILJET_SMTP_HOST,
    port: env.MAILJET_SMTP_PORT,
    secure: env.MAILJET_SMTP_PORT === 465,
    auth: {
      user: env.MAILJET_API_KEY,
      pass: env.MAILJET_API_SECRET
    }
  });

  async sendIntakeLeadEmail(
    client: Client,
    lead: IntakeLead,
    callSession: CallSession
  ): Promise<void> {
    const recipient = client.notificationEmail;
    if (!recipient) return;

    const subject = `New intake lead - ${client.name}`;
    const lines: string[] = [
      `Client: ${client.name}`,
      `Twilio Call SID: ${callSession.twilioCallSid}`,
      `From: ${callSession.fromNumber}`,
      `To: ${callSession.toNumber}`,
      `Time: ${lead.createdAt.toISOString()}`,
      '',
      `Name: ${lead.capturedName ?? ''}`,
      `Phone: ${lead.capturedPhone ?? ''}`,
      `Email: ${lead.capturedEmail ?? ''}`,
      `Reason: ${lead.capturedReason ?? ''}`,
      `Preferred contact time: ${lead.preferredContactTime ?? ''}`
    ];

    if (lead.extraFields && typeof lead.extraFields === 'object') {
      lines.push('', 'Extra fields:');
      for (const [key, value] of Object.entries(lead.extraFields as Record<string, unknown>)) {
        lines.push(`- ${key}: ${value ?? ''}`);
      }
    }

    if (lead.rawSummary) {
      lines.push('', 'Summary:', lead.rawSummary);
    }

    try {
      await this.transporter.sendMail({
        from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM_EMAIL}>`,
        to: recipient,
        subject,
        text: lines.join('\n')
      });
    } catch (err) {
      logger.error({ err, recipient, callSessionId: callSession.id }, 'Failed to send intake email');
    }
  }

  async sendContactEmail(payload: {
    name: string;
    email: string;
    company?: string;
    phone?: string;
    message: string;
    locale?: string;
  }): Promise<void> {
    const recipient = env.CONTACT_EMAIL;
    const subject = `New contact request - ${payload.name}`;
    const lines: string[] = [
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      `Company: ${payload.company ?? ''}`,
      `Phone: ${payload.phone ?? ''}`,
      `Locale: ${payload.locale ?? ''}`,
      '',
      'Message:',
      payload.message
    ];

    try {
      await this.transporter.sendMail({
        from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM_EMAIL}>`,
        to: recipient,
        subject,
        text: lines.join('\n')
      });
    } catch (err) {
      logger.error({ err, recipient }, 'Failed to send contact email');
    }
  }
}

export const emailService = new EmailService();

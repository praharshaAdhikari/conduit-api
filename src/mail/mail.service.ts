import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { mailSettings } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly from: string;
  private readonly transport: Transporter | null;

  constructor() {
    const { host, port, from } = mailSettings();
    this.from = from;
    this.transport = host
      ? createTransport({ host, port, secure: false })
      : null;
  }

  /** Sends a plain-text email. Throws if the mail server refuses or cannot be reached. */
  async send(message: MailMessage): Promise<void> {
    if (!this.transport) {
      this.logger.log(
        `SMTP_HOST is not set, so this was not sent.\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
      );
      return;
    }
    await this.transport.sendMail({ from: this.from, ...message });
  }

  /** For mail the request does not depend on: a failure is logged, not raised. */
  async sendQuietly(message: MailMessage): Promise<void> {
    try {
      await this.send(message);
    } catch (error) {
      this.logger.warn(
        `"${message.subject}" to ${message.to} was not sent: ${String(error)}`,
      );
    }
  }
}

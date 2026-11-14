import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ProviderError } from '../../common/errors/provider.error.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { EmailMessage, Mailer } from '../../ports/mailer.js';

/** Gmail SMTP with an App Password (free, a few hundred emails per day). */
export class SmtpMailerAdapter implements Mailer {
  readonly name = 'smtp';
  private readonly logger = new Logger(SmtpMailerAdapter.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: AppConfigService) {
    const smtp = config.smtp;
    this.from = `"Smart City Helpdesk" <${smtp.user}>`;
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.appPassword },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      const info = await this.transporter.sendMail({ from: this.from, ...message });
      this.logger.log(`Email sent to ${this.mask(message.to)} (${info.messageId})`);
    } catch (err) {
      throw new ProviderError(this.name, 'send email', err);
    }
  }

  /** n***@example.com — keeps addresses out of logs */
  private mask(email: string): string {
    const [user, domain] = email.split('@');
    return `${user.slice(0, 1)}***@${domain}`;
  }
}

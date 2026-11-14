export const MAILER = Symbol('MAILER');

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text version for clients that don't render HTML */
  text: string;
  replyTo?: string;
}

/** Gmail SMTP today; Resend/SES/etc. later by adding an adapter. */
export interface Mailer {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

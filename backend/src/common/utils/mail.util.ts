import * as nodemailer from 'nodemailer';

export interface SmtpConfig {
  mailHost: string | null;
  mailPort: number | null;
  mailUsername: string | null;
  mailPassword: string | null;
  mailEncryption: string;
  fromMailAddress: string | null;
  fromMailName: string | null;
}

export interface MailMessage {
  to?: string | string[];
  /** Recipients hidden from each other and from `to` - for customers. */
  bcc?: string[];
  subject: string;
  text: string;
}

/**
 * Sends one message through a tenant's SMTP configuration. Throws when the
 * configuration is incomplete or the server refuses the message; callers
 * decide how to report that.
 */
export async function sendSmtpMail(config: SmtpConfig, message: MailMessage): Promise<void> {
  if (!config.mailHost || !config.mailPort) throw new Error('mailHost and mailPort must be set');
  if (!config.fromMailAddress) throw new Error('fromMailAddress must be set');

  // Ports 465/2465 are always implicit TLS (SMTPS) by convention, regardless of
  // what mailEncryption happens to be set to - getting this wrong causes the
  // server to drop the connection before the SMTP handshake even starts.
  const IMPLICIT_TLS_PORTS = new Set([465, 2465]);
  const secure =
    IMPLICIT_TLS_PORTS.has(config.mailPort) ||
    config.mailEncryption === 'SSL' ||
    config.mailEncryption === 'SMTPS';
  const requireTLS = !secure && config.mailEncryption === 'TLS';

  const transport = nodemailer.createTransport({
    host: config.mailHost,
    port: config.mailPort,
    secure,
    requireTLS,
    auth: config.mailUsername
      ? { user: config.mailUsername, pass: config.mailPassword ?? undefined }
      : undefined,
  });

  await transport.sendMail({
    from: config.fromMailName
      ? { name: config.fromMailName, address: config.fromMailAddress }
      : config.fromMailAddress,
    to: message.to,
    ...(message.bcc?.length ? { bcc: message.bcc } : {}),
    subject: message.subject,
    text: message.text,
  });
}

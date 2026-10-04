import nodemailer from 'nodemailer';
import { config } from '../config.js';

export async function enviarEmail(to: string, subject: string, text: string) {
  if (!config.smtp.host) {
    if (config.isProd) {
      // Em produção nunca loga o conteúdo (pode conter token de redefinição de senha em texto puro).
      console.warn(`[E-MAIL] SMTP não configurado — e-mail para ${to} ("${subject}") não foi enviado. Configure SMTP_* antes de usar em produção.`);
    } else {
      console.log(`\n[E-MAIL não enviado — SMTP não configurado]\nPara: ${to}\nAssunto: ${subject}\n${text}\n`);
    }
    return;
  }
  const t = nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  await t.sendMail({ from: config.smtp.from, to, subject, text });
}

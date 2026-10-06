import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
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
  const opts: SMTPTransport.Options & { allowInternalNetworkInterfaces?: boolean } = {
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  };
  // Antes de resolver DNS, o nodemailer confere se a MÁQUINA tem uma interface de rede local
  // IPv4 "externa" — em alguns hosts (ex. Render) a única interface reportada é IPv6, então ele
  // nunca tenta IPv4 e cai só em endereços IPv6 do SMTP, que ficam inalcançáveis (ENETUNREACH).
  // Essa opção inclui a interface de loopback (sempre IPv4) nessa checagem, destravando o IPv4 real.
  opts.allowInternalNetworkInterfaces = true;
  const t = nodemailer.createTransport(opts);
  await t.sendMail({ from: config.smtp.from, to, subject, text });
}

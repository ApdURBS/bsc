import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { config } from '../config.js';

/** Extrai nome e e-mail de "Nome <email>" (formato usado em SMTP_FROM). */
function partirRemetente(from: string): { name?: string; email: string } {
  const m = /^(.*)<(.+)>$/.exec(from);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: from.trim() };
}

async function viaBrevo(to: string, subject: string, text: string) {
  const sender = partirRemetente(config.smtp.from);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'api-key': config.brevoApiKey },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text }),
  });
  if (!res.ok) throw new Error(`Brevo respondeu ${res.status}: ${await res.text().catch(() => '')}`);
}

async function viaSmtp(to: string, subject: string, text: string) {
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

export async function enviarEmail(to: string, subject: string, text: string) {
  if (config.brevoApiKey) return viaBrevo(to, subject, text);
  if (!config.smtp.host) {
    if (config.isProd) {
      // Em produção nunca loga o conteúdo (pode conter token de redefinição de senha em texto puro).
      console.warn(`[E-MAIL] Nenhum provedor configurado — e-mail para ${to} ("${subject}") não foi enviado. Configure BREVO_API_KEY ou SMTP_* antes de usar em produção.`);
    } else {
      console.log(`\n[E-MAIL não enviado — nenhum provedor configurado]\nPara: ${to}\nAssunto: ${subject}\n${text}\n`);
    }
    return;
  }
  return viaSmtp(to, subject, text);
}

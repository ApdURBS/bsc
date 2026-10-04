import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config.js';

export const COOKIE_TOKEN = 'bsc_token';
export const COOKIE_CSRF = 'bsc_csrf';

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export function validarSenha(p: string): string | null {
  if (p.length < 8) return 'A senha deve ter no mínimo 8 caracteres.';
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p)) return 'A senha deve conter letra maiúscula, minúscula e número.';
  return null;
}

export const signToken = (userId: number, sessionId: string, expiresInSec: number) =>
  jwt.sign({ sub: String(userId), sid: sessionId }, config.jwtSecret, { expiresIn: expiresInSec });
export const verifyToken = (t: string) => jwt.verify(t, config.jwtSecret) as { sub: string; sid: string };

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let supabase: SupabaseClient | null = null;
if (config.supabase.url && config.supabase.serviceRoleKey) {
  supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, { auth: { persistSession: false } });
}

export const storageAtiva = () => (supabase ? 'supabase' : 'local');

/**
 * Grava o arquivo pela chave relativa (ano/mês/uuid, ver documents.ts).
 * Usa Supabase Storage quando configurado (produção); senão, disco local em UPLOAD_DIR (dev/testes).
 */
export async function salvarArquivo(rel: string, buffer: Buffer): Promise<void> {
  if (supabase) {
    const { error } = await supabase.storage.from(config.supabase.bucket).upload(rel, buffer, {
      contentType: 'application/octet-stream',
      upsert: false,
    });
    if (error) throw new Error(`Falha ao gravar arquivo no Supabase Storage: ${error.message}`);
    return;
  }
  const abs = path.join(config.uploadDir, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
}

/** Lê o arquivo de volta como Buffer, ou null se não existir. */
export async function lerArquivo(rel: string): Promise<Buffer | null> {
  if (supabase) {
    const { data, error } = await supabase.storage.from(config.supabase.bucket).download(rel);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  const abs = path.resolve(config.uploadDir, rel);
  if (!abs.startsWith(path.resolve(config.uploadDir)) || !existsSync(abs)) return null;
  return readFile(abs);
}

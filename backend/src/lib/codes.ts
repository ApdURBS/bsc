/** Letras de etapa estilo coluna do Excel: 1=A ... 26=Z, 27=AA */
export function letraDeOrdem(n: number): string {
  let s = ''; let x = n;
  while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
  return s;
}
export function ordemDeLetra(l: string): number {
  return l.toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
}
export const letraValida = (l: string) => /^[A-Z]{1,3}$/.test(l);

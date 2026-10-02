/**
 * Fatia (00–ff) onde moram os detalhes de um jogo no R2: FNV-1a de 32 bits do
 * ID, módulo 256. O pipeline (pipeline/build.mts) tem uma cópia desta função;
 * um teste garante que as duas dão o mesmo resultado.
 */
export function detailShard(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) & 0xff).toString(16).padStart(2, '0');
}

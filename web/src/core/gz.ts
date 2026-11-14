// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Gzip decompression for the `.bin.gz` contract files (09_contrato_datos.md), with the platform
// DecompressionStream (browsers and Node ≥ 18): no extra library (02_arquitectura.md §3).

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Decompresses a gzip buffer. Throws if it does not start with the gzip magic number. */
export async function gunzip(data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!isGzip(bytes)) throw new Error('Not a gzip stream');
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Bytes of a `.gz` file as served. Some hosts send it with `Content-Encoding: gzip` and the
 * browser has already decompressed it: then the data does not start with the magic number and is
 * returned as is (the caller still checks the exact size and header).
 */
export async function maybeGunzip(data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return isGzip(bytes) ? gunzip(bytes) : bytes;
}

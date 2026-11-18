import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const executar = promisify(execFile);
const SCRIPT = fileURLToPath(
  new URL('../../../../scripts/minio/espelhar-fotos.sh', import.meta.url),
);

// Um `mc` de mentira: o "bucket" é uma pasta (BUCKET_DIR) e o espelho, outra. Só os quatro
// comandos que o script usa (cat, pipe, mirror).
const MC_FALSO = `#!/usr/bin/env bash
set -e
cmd=$1; shift
chave() { echo "\${1#lumens/*/}"; }
case $cmd in
  cat) cat "$BUCKET_DIR/$(chave "$1")" ;;
  pipe) mkdir -p "$BUCKET_DIR"; cat >"$BUCKET_DIR/$(chave "$1")" ;;
  mirror)
    for ultimo; do :; done
    find "$ultimo" -mindepth 1 -delete
    cp -a "$BUCKET_DIR"/. "$ultimo"/ ;;
  *) echo "mc falso: $cmd" >&2; exit 2 ;;
esac
`;

describe('espelhar-fotos.sh', () => {
  let raiz: string;
  let bucket: string;
  let espelho: string;
  let bin: string;

  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'espelho-'));
    bucket = join(raiz, 'bucket');
    espelho = join(raiz, 'espelho');
    bin = join(raiz, 'bin');
    await Promise.all([mkdir(bucket), mkdir(espelho), mkdir(bin)]);
    await writeFile(join(bin, 'mc'), MC_FALSO);
    await chmod(join(bin, 'mc'), 0o755);
  });
  afterEach(() => rm(raiz, { recursive: true, force: true }));

  const rodar = (extra: Record<string, string> = {}) =>
    executar('bash', [SCRIPT], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        BUCKET_DIR: bucket,
        ESPELHO: espelho,
        S3_BUCKET_FOTOS: 'fotos',
        MC_HOST_lumens: 'http://x:y@minio:9000',
        ...extra,
      },
    });
  const nomes = async (pasta: string) => (await readdir(pasta)).sort();

  it('na primeira rodada cria o marcador no bucket e espelha tudo', async () => {
    await writeFile(join(bucket, 'a.jpg'), 'a');
    await rodar();
    expect(await nomes(espelho)).toEqual(['.lumens-volume-id', 'a.jpg']);
    expect(await readFile(join(espelho, '.lumens-volume-id'), 'utf8')).toBe(
      await readFile(join(bucket, '.lumens-volume-id'), 'utf8'),
    );
  });

  it('no mesmo volume, o que saiu do bucket sai do espelho', async () => {
    await writeFile(join(bucket, 'a.jpg'), 'a');
    await writeFile(join(bucket, 'b.jpg'), 'b');
    await rodar();
    await rm(join(bucket, 'a.jpg'));
    await rodar();
    expect(await nomes(espelho)).toEqual(['.lumens-volume-id', 'b.jpg']);
  });

  it('bucket recriado com um arquivo novo não apaga o espelho', async () => {
    await writeFile(join(bucket, 'antiga.jpg'), 'antiga');
    await rodar();
    // Volume perdido: o deploy recria o bucket e alguém envia uma foto antes do próximo backup.
    await rm(bucket, { recursive: true });
    await mkdir(bucket);
    await writeFile(join(bucket, 'nova.jpg'), 'nova');
    await expect(rodar()).rejects.toMatchObject({ code: 1 });
    expect(await nomes(espelho)).toEqual(['.lumens-volume-id', 'antiga.jpg']);
  });

  it('bucket recriado vazio também não apaga o espelho', async () => {
    await writeFile(join(bucket, 'antiga.jpg'), 'antiga');
    await rodar();
    await rm(bucket, { recursive: true });
    await mkdir(bucket);
    await expect(rodar()).rejects.toMatchObject({ code: 1 });
    expect(await nomes(espelho)).toEqual(['.lumens-volume-id', 'antiga.jpg']);
  });

  it('depois de restaurar o espelho no bucket, o espelhamento volta ao normal', async () => {
    await writeFile(join(bucket, 'antiga.jpg'), 'antiga');
    await rodar();
    await rm(bucket, { recursive: true });
    await mkdir(bucket);
    await writeFile(join(bucket, 'nova.jpg'), 'nova');
    // Restauração documentada: `mc mirror --overwrite /backup bucket` leva o marcador de volta.
    for (const nome of ['antiga.jpg', '.lumens-volume-id']) {
      await writeFile(join(bucket, nome), await readFile(join(espelho, nome)));
    }
    await rodar();
    expect(await nomes(espelho)).toEqual(['.lumens-volume-id', 'antiga.jpg', 'nova.jpg']);
  });

  it('ADOTAR_BUCKET=1 aceita o bucket de agora e cria o marcador que faltava', async () => {
    await writeFile(join(espelho, 'velha.jpg'), 'velha');
    await writeFile(join(bucket, 'a.jpg'), 'a');
    await expect(rodar()).rejects.toMatchObject({ code: 1 });
    await rodar({ ADOTAR_BUCKET: '1' });
    expect(await nomes(espelho)).toEqual(['.lumens-volume-id', 'a.jpg']);
  });
});

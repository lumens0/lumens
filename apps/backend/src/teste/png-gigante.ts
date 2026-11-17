/**
 * Só para testes (SCRUM-304): um PNG válido de `lado`×`lado` pixels que pesa poucos KB. Tons de
 * cinza de 1 bit, tudo preto: comprime quase a nada. É o formato de um ataque de "bomba de
 * pixels": passa folgado no limite de 5 MB e, aberto, ocupa muita memória.
 */
import { crc32, deflateSync } from 'node:zlib';

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function bloco(tipo: string, dados: Buffer): Buffer {
  const nome = Buffer.from(tipo, 'ascii');
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([nome, dados])));
  return Buffer.concat([tamanho, nome, dados, crc]);
}

export function pngGigante(lado: number): Buffer {
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(lado, 0);
  cabecalho.writeUInt32BE(lado, 4);
  cabecalho[8] = 1; // 1 bit por pixel
  cabecalho[9] = 0; // tons de cinza
  // Cada linha: 1 byte de filtro (0) + os pixels, 8 por byte.
  const linhas = Buffer.alloc((1 + Math.ceil(lado / 8)) * lado);
  return Buffer.concat([
    ASSINATURA,
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

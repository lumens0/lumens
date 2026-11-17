import sharp from 'sharp';

/** Formatos aceitos por removerMetadados. */
export const FORMATOS_ACEITOS = ['jpeg', 'png', 'webp'] as const;
export type FormatoAceito = (typeof FORMATOS_ACEITOS)[number];

/**
 * Limite de tamanho de uma foto: 5 MB. A regra mora aqui, num lugar só: o download da Meta
 * (`meta-midia.ts`) e `removerMetadados` conferem com a mesma função.
 */
export const TAMANHO_MAXIMO_FOTO = 5 * 1024 * 1024;

/** O arquivo passa do limite? Exatamente 5 MB ainda é aceito. */
export const passaDoTamanhoMaximo = (bytes: number): boolean => bytes > TAMANHO_MAXIMO_FOTO;

/**
 * Limite de pixels de uma foto: 40 MP (SCRUM-304). O padrão do sharp é ~268 MP, e uma imagem bem
 * comprimida de 16383×16383 cabe em menos de 5 MB e prende a CPU e a memória do worker ao ser
 * aberta. 40 MP passa folgado das fotos que chegam pelo WhatsApp e pelo Telegram, que recomprimem
 * (no máximo uns 4096 px de lado). Acima disso, o sharp recusa já ao ler o cabeçalho, antes de
 * decodificar.
 */
export const LIMITE_DE_PIXELS = 40_000_000;

/** Opções de entrada de todo `sharp()` que abre uma foto recebida. */
export const ENTRADA_DA_FOTO = { limitInputPixels: LIMITE_DE_PIXELS } as const;

/** Qualidade usada ao recodificar JPEG e WebP (0–100). */
const QUALIDADE = 85;

/** Erro lançado quando a imagem não pode ser processada. */
export class ErroImagemInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroImagemInvalida';
  }
}

/** O arquivo passa de TAMANHO_MAXIMO_FOTO. */
export class ErroImagemGrande extends ErroImagemInvalida {
  constructor() {
    super('Arquivo acima de 5 MB.');
    this.name = 'ErroImagemGrande';
  }
}

function ehFormatoAceito(formato: string): formato is FormatoAceito {
  return FORMATOS_ACEITOS.some((aceito) => aceito === formato);
}

/**
 * Remove todos os metadados (EXIF, GPS, XMP, IPTC, ICC) de uma imagem.
 *
 * - Aplica a orientação EXIF nos pixels antes de descartá-la, para que fotos
 *   tiradas com o celular na vertical continuem na posição certa.
 * - Mantém o formato de entrada (JPEG → JPEG, PNG → PNG, WebP → WebP).
 * - Trabalha só em memória: nada é gravado em disco.
 *
 * @param entrada Conteúdo do arquivo enviado.
 * @returns Nova imagem, sem metadados.
 * @throws {ErroImagemGrande} Se o arquivo passar de TAMANHO_MAXIMO_FOTO; nem chega a ser aberto.
 * @throws {ErroImagemInvalida} Se o arquivo estiver vazio, corrompido, num
 *   formato fora de FORMATOS_ACEITOS ou acima de LIMITE_DE_PIXELS.
 */
export async function removerMetadados(entrada: Buffer): Promise<Buffer> {
  if (!Buffer.isBuffer(entrada) || entrada.length === 0) {
    throw new ErroImagemInvalida('Arquivo vazio.');
  }
  if (passaDoTamanhoMaximo(entrada.length)) throw new ErroImagemGrande();

  let formato: string;
  try {
    ({ format: formato } = await sharp(entrada, ENTRADA_DA_FOTO).metadata());
  } catch {
    // Inclui a imagem acima de LIMITE_DE_PIXELS: o sharp recusa já no cabeçalho.
    throw new ErroImagemInvalida('Arquivo corrompido, não é uma imagem ou tem pixels demais.');
  }

  if (!ehFormatoAceito(formato)) {
    throw new ErroImagemInvalida(`Formato não suportado: ${formato}. Envie JPEG, PNG ou WebP.`);
  }

  // Por padrão o sharp não copia metadados para a saída.
  // NÃO usar .withMetadata(), .keepMetadata(), .keepExif() nem .keepIccProfile().
  const imagem = sharp(entrada, { ...ENTRADA_DA_FOTO, failOn: 'error' }).rotate();

  try {
    switch (formato) {
      case 'jpeg':
        return await imagem.jpeg({ quality: QUALIDADE, mozjpeg: true }).toBuffer();
      case 'png':
        return await imagem.png().toBuffer();
      case 'webp':
        return await imagem.webp({ quality: QUALIDADE }).toBuffer();
    }
  } catch {
    throw new ErroImagemInvalida('Não foi possível processar a imagem.');
  }
}

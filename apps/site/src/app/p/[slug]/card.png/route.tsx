import { respostaDoCard, type Contexto } from '../card';

// Card da pauta em formato story, para o status e os grupos (RF-S05) e para o bot mandar como
// imagem depois do apoio (RF-B08, 2.9). O modelo, os dados, o 404 e o cache ficam em `../card`.

export async function GET(request: Request, { params }: Contexto) {
  return respostaDoCard(request, (await params).slug, 'story');
}

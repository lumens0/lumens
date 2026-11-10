import { respostaDoCard, type Contexto } from '../card';

// Variação horizontal (1200 × 630) do card, usada como `og:image` da página: a prévia do link no
// WhatsApp corta imagem vertical. Mesmo modelo, dados, 404 e cache do `card.png` (SCRUM-55).

export async function GET(request: Request, { params }: Contexto) {
  return respostaDoCard(request, (await params).slug, 'og');
}

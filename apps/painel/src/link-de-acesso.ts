/**
 * Entrega do link de acesso ao painel. No `next dev` (`NODE_ENV === 'development'`) o link não
 * vai por e-mail: aparece no terminal do painel, para entrar sem uma conta SMTP. `next build`,
 * `next start` e a imagem Docker rodam como `production`, então o link nunca vai para o log lá.
 */
export function entregarLink(
  url: string,
  {
    emDev,
    enviar,
    mostrar = console.info,
  }: { emDev: boolean; enviar: () => void; mostrar?: (linha: string) => void },
): void {
  if (emDev) {
    mostrar(`Link de acesso ao painel (pnpm dev: e-mail não enviado): ${url}`);
    return;
  }
  enviar();
}

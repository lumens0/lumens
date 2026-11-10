/** Para onde o proxy manda cada pedido. Rotas de API em `/curadoria/*`; o resto são páginas. */
export function destino(caminho: string, logado: boolean): 'segue' | 'nao_autorizado' | 'login' {
  if (logado || caminho === '/login' || caminho.startsWith('/login/')) return 'segue';
  return caminho.startsWith('/curadoria/') ? 'nao_autorizado' : 'login';
}

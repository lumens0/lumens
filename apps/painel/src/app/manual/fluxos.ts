import type { FluxoEmCards } from '@lumens/marca/fluxo';

/**
 * Os fluxos da curadoria em cards. Os números são os do sistema: prazo de 24 h em
 * `PRAZO_DE_CURADORIA_MS`, motivo de recusa até 500 caracteres em `MOTIVO_RECUSA_MAXIMO`, meta de
 * 30 a 300 em `META_MINIMA` e `META_MAXIMA`, conferência de 7 dias em `DIAS_DE_CONFERENCIA` e
 * quórum de 10% em `QUORUM_MINIMO`. Se um mudar, mude aqui também.
 */
export const FLUXOS_DA_CURADORIA: readonly FluxoEmCards[] = [
  {
    id: 'decidir',
    rotulo: 'Decidir uma pauta nova',
    chamada:
      'Toda pauta nova espera a curadoria. A meta é decidir em até 24 horas; o selo de prazo da lista mostra quanto falta.',
    passos: [
      {
        titulo: 'Abra a fila',
        icone: 'lista',
        onde: 'painel',
        resumo: 'Em Pautas, o filtro “Esperando decisão” já vem marcado.',
        detalhe:
          'O Início mostra quantas pautas esperam e quantas vencem em breve. Organize o dia pelo prazo.',
      },
      {
        titulo: 'Leia tudo antes de decidir',
        icone: 'olho',
        onde: 'painel',
        resumo: 'Título, descrição, foto, relato de quem criou e a linha do tempo.',
        detalhe:
          'Se a pessoa editou o texto depois que a tela abriu, a aprovação é barrada e você relê o texto novo.',
      },
      {
        titulo: 'Olhe os achados',
        icone: 'escudo',
        onde: 'painel',
        resumo: '“Barrar” (e-mail, telefone, matrícula) e “Conferir” (possível nome de pessoa).',
        detalhe:
          'Se o relato de quem criou a pauta tem dado pessoal, use “Recusar só o relato”: a pauta segue em curadoria e, aprovada, vai ao site sem ele.',
      },
      {
        titulo: 'Confira a categoria',
        icone: 'etiqueta',
        onde: 'painel',
        resumo:
          'Ela vem de quem relatou: troque só se estiver errada. Marque “urgente” só se for o caso.',
        detalhe:
          'O motivo da urgência fica só no painel; o site mostra apenas que a pauta é urgente.',
      },
      {
        titulo: 'Marque que conferiu e aprove',
        icone: 'visto',
        onde: 'painel',
        resumo: 'A caixa de conferência é obrigatória: aprovar publica tudo no site agora.',
        detalhe: 'A pauta passa a juntar apoios e o relato de quem a criou é publicado junto.',
      },
      {
        titulo: 'Ou recuse com motivo',
        icone: 'fechar',
        onde: 'painel',
        resumo: 'O motivo (até 500 caracteres) é enviado a quem criou, pelo bot.',
        detalhe: 'Escreva de um jeito que a pessoa consiga corrigir e tentar de novo.',
      },
    ],
  },
  {
    id: 'relatos',
    rotulo: 'Moderar relatos',
    chamada:
      'Relatos e fotos novos em pautas já públicas esperam a moderação. Eles só vão ao site depois de aprovados.',
    passos: [
      {
        titulo: 'Abra “Relatos em pautas publicadas”',
        icone: 'lista',
        onde: 'painel',
        resumo: 'A lista agrupa os relatos pendentes por pauta.',
      },
      {
        titulo: 'Confira texto e foto',
        icone: 'camera',
        onde: 'painel',
        resumo: 'Nada de nome de pessoa, ofensa ou dado pessoal, nem em nenhuma das fotos (até 3).',
        detalhe:
          'Para barrar só uma foto, use “Recusar só esta foto” e escreva o motivo: o texto e as outras fotos seguem.',
      },
      {
        titulo: 'Marque que conferiu e aprove',
        icone: 'visto',
        onde: 'painel',
        resumo: 'A caixa de conferência vale por relato. Aprovado, ele aparece no site na hora.',
      },
      {
        titulo: 'Ou recuse',
        icone: 'fechar',
        onde: 'painel',
        resumo: 'O relato inteiro, com todas as fotos, não vai ao site. Não há motivo a escrever.',
      },
    ],
  },
  {
    id: 'ajustes',
    rotulo: 'Corrigir uma pauta publicada',
    chamada:
      'A curadoria não reescreve a pauta de ninguém, mas pode corrigir o que está em volta do texto.',
    passos: [
      {
        titulo: 'Abra a pauta',
        icone: 'lista',
        onde: 'painel',
        resumo: 'Em Pautas, filtre pela etapa ou busque pelo título.',
      },
      {
        titulo: 'Bloco e meta',
        icone: 'ajustes',
        onde: 'painel',
        resumo: 'Corrija o bloco (a meta é recalculada) ou ajuste a meta, de 30 a 300.',
        detalhe:
          'Só enquanto a pauta está em curadoria ou juntando apoios. O motivo é obrigatório e fica na linha do tempo.',
      },
      {
        titulo: 'Urgência e categoria',
        icone: 'etiqueta',
        onde: 'painel',
        resumo: 'Troque quando a situação mudar. O motivo da urgência é opcional.',
      },
      {
        titulo: 'Texto errado? Quem criou pede a mudança',
        icone: 'conversa',
        onde: 'painel',
        resumo: 'O pedido chega em “Pedidos de edição”.',
        detalhe: 'Quem apoiou, apoiou aquele texto.',
      },
    ],
  },
  {
    id: 'pedidos',
    rotulo: 'Pedidos de edição',
    chamada:
      'Depois de publicada, quem criou a pauta não edita direto: pede a mudança pelo bot e a curadoria decide.',
    passos: [
      {
        titulo: 'Abra “Pedidos de edição”',
        icone: 'lista',
        onde: 'painel',
        resumo: 'A lista mostra os pedidos de título e de descrição que esperam decisão.',
      },
      {
        titulo: 'Compare o antes e o depois',
        icone: 'olho',
        onde: 'painel',
        resumo: 'Cada pedido traz o texto publicado e o texto novo, lado a lado.',
      },
      {
        titulo: 'Aprove: o texto novo vai ao site',
        icone: 'visto',
        onde: 'painel',
        resumo: 'A mudança vale na hora e quem pediu recebe o aviso pelo bot.',
        detalhe:
          'Texto novo com e-mail, telefone ou matrícula não pode ser publicado: recuse, com o motivo.',
      },
      {
        titulo: 'Ou recuse com motivo',
        icone: 'fechar',
        onde: 'painel',
        resumo: 'O texto publicado continua o mesmo e o motivo vai pelo bot a quem pediu.',
      },
    ],
  },
  {
    id: 'promessa',
    rotulo: 'Resposta e promessa',
    chamada:
      'A universidade respondeu: a curadoria registra a promessa e a conferência decide o resultado.',
    passos: [
      {
        titulo: 'Veja o que chegou',
        icone: 'arquivo',
        onde: 'painel',
        resumo: 'Quem cuida da pauta manda a resposta oficial (PDF) pelo bot.',
        detalhe: 'O filtro “sem resposta oficial” da lista mostra as pautas que esperam você.',
      },
      {
        titulo: 'Registre resposta e promessa',
        icone: 'lapis',
        onde: 'painel',
        resumo: 'Resumo, quem respondeu e a data prometida. O PDF fica ao lado do formulário.',
        detalhe: 'O resumo vai para a página pública: não cite nome de pessoa.',
      },
      {
        titulo: 'Quem apoiou é avisado',
        icone: 'sino',
        onde: 'automatico',
        resumo: 'O bot manda o aviso da resposta a cada apoiador.',
      },
      {
        titulo: 'A conferência abre',
        icone: 'pessoas',
        onde: 'automatico',
        resumo: 'Na data prometida, quem apoiou responde “Foi feito?” por 7 dias.',
        detalhe: 'Pelo menos 10% de quem apoiou precisa responder para a apuração valer.',
      },
      {
        titulo: 'O resultado sai sozinho',
        icone: 'trofeu',
        onde: 'automatico',
        resumo: 'Conquistada, entregue em parte ou descumprida, pelo voto de quem respondeu.',
        detalhe:
          'Nem a curadoria nem quem cuida da pauta marcam conquista. Sem quórum duas vezes, a pauta volta a ser cobrada.',
      },
      {
        titulo: 'Prazos mudaram?',
        icone: 'relogio',
        onde: 'painel',
        resumo:
          'Em “Ajustes de prazo”: prorrogar, corrigir a data do protocolo ou remarcar a promessa.',
      },
    ],
  },
];

/** Só a administração gerencia quem entra: vira uma aba a mais para esse papel. */
export const FLUXO_DE_ADMINISTRACAO: FluxoEmCards = {
  id: 'curadores',
  rotulo: 'Gerir curadores',
  chamada: 'Só administradores veem a tela “Curadores”.',
  passos: [
    {
      titulo: 'Abra “Curadores”',
      icone: 'pessoas',
      onde: 'painel',
      resumo: 'Link no cabeçalho, só para administrador.',
    },
    {
      titulo: 'Adicione pela tela',
      icone: 'email',
      onde: 'painel',
      resumo: 'E-mail @ufal.br, nome e papel (curador ou administrador).',
      detalhe:
        'A pessoa entra por um link mandado ao e-mail: vale 15 minutos e uma vez só, e a sessão dura 7 dias.',
    },
    {
      titulo: 'Desative e reative',
      icone: 'ajustes',
      onde: 'painel',
      resumo: 'Ninguém desativa a si mesmo e o último administrador ativo não sai.',
    },
  ],
};

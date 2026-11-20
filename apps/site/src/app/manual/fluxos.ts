import type { FluxoEmCards } from '@lumens/marca/fluxo';

/**
 * Os fluxos do manual público: o que a pessoa faz no bot e no site, na ordem em que
 * acontece. Os números (24 h, 3 pessoas, 30 dias, 7 dias, 10 %) são os do sistema: prazo da
 * curadoria em `PRAZO_DE_CURADORIA_MS`, donos em `LIMITE_DE_OWNERS`, Fala.BR em `protocolo-falabr`,
 * conferência em `DIAS_DE_CONFERENCIA` e `QUORUM_MINIMO`. Se um mudar, mude aqui também.
 */
export const FLUXOS: readonly FluxoEmCards[] = [
  {
    id: 'relatar',
    rotulo: 'Relatar um problema',
    chamada: 'Você viu algo errado no campus e quer que vire uma pauta pública.',
    passos: [
      {
        titulo: 'Chame o bot',
        icone: 'conversa',
        exemplo: [
          { de: 'voce', texto: 'oi' },
          {
            de: 'bot',
            texto: 'Oi! O que você quer fazer? 1 Relatar problema · 2 Apoiar · 3 Minhas pautas',
          },
        ],
        onde: 'bot',
        resumo: 'Mande uma mensagem e escolha “Relatar problema” no menu.',
        detalhe:
          'O botão “Relatar” no alto do site abre a conversa. A qualquer momento, “menu” volta ao começo e “cancelar” larga o que você estava fazendo.',
      },
      {
        titulo: 'Conte o que viu',
        icone: 'lapis',
        exemplo: [
          { de: 'bot', texto: 'Conte o que está acontecendo e onde.' },
          { de: 'voce', texto: 'O bebedouro do bloco 12 está quebrado desde agosto' },
        ],
        onde: 'bot',
        resumo: 'Escreva o que acontece e onde, com suas palavras.',
        detalhe: 'Sem nome de pessoa, e-mail ou telefone: a pauta é pública.',
      },
      {
        titulo: 'Veja se já existe',
        icone: 'busca',
        exemplo: [
          {
            de: 'bot',
            texto:
              'Achei pautas parecidas: 1 Bebedouro quebrado no bloco 12 (84 apoios). É o mesmo problema?',
          },
        ],
        onde: 'bot',
        resumo: 'O bot mostra pautas abertas parecidas com o seu relato.',
        detalhe:
          'Se for o mesmo problema, apoie a que já existe: junta mais força. Se não for, siga para criar uma nova.',
      },
      {
        titulo: 'Verifique seu e-mail',
        icone: 'email',
        exemplo: [
          { de: 'bot', texto: 'Qual é o seu e-mail @ufal.br?' },
          { de: 'voce', texto: 'nome@ufal.br' },
          { de: 'bot', texto: 'Mandei um código para o seu e-mail. Qual é ele?' },
        ],
        onde: 'bot',
        resumo: 'Com o e-mail @ufal.br, o bot manda um código e você responde com ele.',
        detalhe:
          'Só na primeira vez. O e-mail fica cifrado e nunca aparece no site. O bot também pergunta o seu curso.',
      },
      {
        titulo: 'Monte a pauta',
        icone: 'etiqueta',
        exemplo: [{ de: 'bot', texto: 'Parece ser Infraestrutura. Confirma?' }],
        onde: 'bot',
        resumo: 'Título, local, categoria, descrição e, se quiser, uma foto.',
        detalhe:
          'O bot sugere uma categoria (“Parece ser Infraestrutura. Confirma?”); você aceita ou escolhe outra. Para corrigir o texto, use “Editar pauta”: antes da decisão vale na hora; depois da publicação vira um pedido que a curadoria confere.',
      },
      {
        titulo: 'A curadoria confere',
        icone: 'escudo',
        onde: 'automatico',
        resumo: 'Em até 24 horas alguém confere e decide.',
        detalhe:
          'A curadoria barra nome de pessoa, ofensa e dado pessoal. Se recusar, você recebe o motivo pelo bot.',
      },
      {
        titulo: 'A pauta vai ao ar',
        icone: 'olho',
        onde: 'site',
        resumo: 'Aprovada, ela aparece no site e começa a juntar apoios.',
        detalhe: 'Você recebe o aviso pelo bot e passa a cuidar da pauta.',
      },
    ],
  },
  {
    id: 'apoiar',
    rotulo: 'Apoiar uma pauta',
    chamada: 'Você achou uma pauta no site e quer somar o seu apoio.',
    passos: [
      {
        titulo: 'Encontre a pauta',
        icone: 'busca',
        onde: 'site',
        resumo: 'Na página inicial, filtre por bloco ou etapa, ou veja o mapa do campus.',
        detalhe: 'Cada pauta mostra os apoios, a meta, a etapa e o que já foi feito.',
      },
      {
        titulo: 'Toque em Apoiar',
        icone: 'coracao',
        exemplo: [
          { de: 'bot', texto: 'Você quer apoiar “Bebedouro quebrado no bloco 12”?' },
          { de: 'voce', texto: 'sim' },
        ],
        onde: 'site',
        resumo: 'O botão leva a conversa para o bot, já com a pauta certa.',
      },
      {
        titulo: 'Verifique o e-mail, se pedir',
        icone: 'email',
        onde: 'bot',
        resumo: 'Só na primeira vez: o código chega no seu e-mail @ufal.br.',
        detalhe: 'Cada pessoa verificada apoia uma pauta uma vez.',
      },
      {
        titulo: 'O apoio conta na hora',
        icone: 'visto',
        exemplo: [{ de: 'bot', texto: 'Apoio registrado! 85 de 100 apoios.' }],
        onde: 'bot',
        resumo: 'O bot confirma e mostra o placar de apoios.',
      },
      {
        titulo: 'Conte a sua experiência',
        icone: 'camera',
        onde: 'bot',
        resumo: 'Opcional: um relato curto e até 3 fotos.',
        detalhe:
          'Eles aparecem no site depois de aprovados pela moderação, sem o seu nome. A curadoria pode recusar uma foto sem recusar o texto: o bot manda o motivo. As fotos perdem a localização antes de serem guardadas.',
      },
      {
        titulo: 'Compartilhe o card',
        icone: 'qr',
        exemplo: [
          {
            de: 'bot',
            texto: 'Compartilhe para juntar mais apoios: lumens.vercel.app/p/bebedouro',
          },
        ],
        onde: 'bot',
        resumo: 'O bot manda uma imagem da pauta, com QR Code, para você divulgar.',
        detalhe: 'Quem apontar a câmera para o QR Code cai direto na pauta e pode apoiar também.',
      },
    ],
  },
  {
    id: 'cuidar',
    rotulo: 'Cuidar de uma pauta',
    chamada: 'Você criou a pauta (ou quis ajudar) e vai levá-la até uma resposta.',
    passos: [
      {
        titulo: 'Abra “Minhas pautas”',
        icone: 'lista',
        exemplo: [
          { de: 'voce', texto: 'minhas pautas' },
          { de: 'bot', texto: 'Escolha a pauta: 1 Bebedouro quebrado no bloco 12' },
        ],
        onde: 'bot',
        resumo: 'No menu, escolha a pauta que você cuida.',
        detalhe:
          'Até 3 pessoas cuidam de cada pauta. Depois de apoiar, se houver vaga, o bot convida com “Quero cuidar”. É preciso o e-mail verificado.',
      },
      {
        titulo: 'Escolha um caminho',
        icone: 'bandeira',
        onde: 'bot',
        resumo: 'Fala.BR, solução da comunidade, representante ou proposta da comunidade.',
        detalhe:
          'Dá para abrir mais de um ao mesmo tempo. Uma solução da comunidade nunca fecha a pauta: a cobrança continua.',
      },
      {
        titulo: 'Fala.BR: copie e cole',
        icone: 'arquivo',
        onde: 'bot',
        resumo: 'O bot monta o texto da manifestação; você cola em falabr.cgu.gov.br.',
        detalhe:
          'E-mail, telefone e matrícula viram [removido]. Possíveis nomes de pessoa ficam no texto, e o bot avisa quais são: apague antes de enviar.',
      },
      {
        titulo: 'Registre o protocolo',
        icone: 'visto',
        exemplo: [
          { de: 'bot', texto: 'Qual é o número do protocolo do Fala.BR?' },
          { de: 'voce', texto: '23546.000123/2026-10' },
        ],
        onde: 'bot',
        resumo: 'Mande o número que o Fala.BR deu e o dia em que registrou.',
        detalhe:
          'A ouvidoria tem 30 dias para responder, prorrogáveis uma vez por mais 30. O protocolo e o prazo ficam públicos na pauta.',
      },
      {
        titulo: 'Envie a resposta oficial',
        icone: 'enviar',
        onde: 'bot',
        resumo: 'Quando a universidade responder, mande o PDF para a curadoria.',
      },
      {
        titulo: 'A curadoria registra a promessa',
        icone: 'escudo',
        onde: 'painel',
        resumo: 'A resposta e a data prometida aparecem na pauta, e quem apoiou é avisado.',
      },
    ],
  },
  {
    id: 'acompanhar',
    rotulo: 'Do apoio à conquista',
    chamada: 'O caminho de uma pauta, do primeiro apoio ao resultado. Tudo é público no site.',
    passos: [
      {
        titulo: 'Juntando apoios',
        icone: 'pessoas',
        onde: 'site',
        resumo: 'A pauta é aprovada e cada apoio conta para a meta.',
        detalhe: 'A meta é 10% dos estudantes do bloco, entre 30 e 300 apoios.',
      },
      {
        titulo: 'Meta batida',
        icone: 'sino',
        onde: 'automatico',
        resumo: 'Quem apoia recebe o aviso. A pauta continua aberta e pode seguir juntando apoios.',
      },
      {
        titulo: 'Em cobrança',
        icone: 'bandeira',
        onde: 'site',
        resumo: 'Com o protocolo registrado, a pauta passa a ser cobrada e o prazo aparece nela.',
      },
      {
        titulo: 'Prometido',
        icone: 'relogio',
        onde: 'site',
        resumo: 'A universidade respondeu e a promessa, com a data, fica registrada.',
      },
      {
        titulo: 'Conferência: “Foi feito?”',
        icone: 'pessoas',
        exemplo: [
          {
            de: 'bot',
            texto: 'A UFAL prometeu entregar até 30/11. Foi feito? 1 Sim · 2 Em parte · 3 Não',
          },
        ],
        onde: 'bot',
        resumo: 'Na data prometida, quem apoiou responde sim, em parte ou não, por 7 dias.',
        detalhe: 'Para valer, pelo menos 10% de quem apoiou precisa responder.',
      },
      {
        titulo: 'Resultado',
        icone: 'trofeu',
        onde: 'automatico',
        resumo: 'Conquistada, entregue em parte ou descumprida, pelo que a maioria respondeu.',
        detalhe:
          'Nem quem cuida da pauta nem a curadoria marcam conquista: só o resultado da conferência. Se a conferência ficar sem quórum duas vezes, a pauta volta a ser cobrada.',
      },
    ],
  },
];

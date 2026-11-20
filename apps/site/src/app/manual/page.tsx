import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Hud, type ItemDoHud } from '../../componentes/Hud';
import { Icone, type NomeDoIcone } from '../../componentes/Icone';
import { CampusInterno } from '../../componentes/internas/CampusInterno';
import { FundoInterno } from '../../componentes/internas/FundoInterno';
import internas from '../../componentes/internas/internas.module.css';
import { metadadosDaMarca } from '../../metadados';
import { nomeDoCanal } from '../../whatsapp';
import { FluxosDoManual } from './FluxosDoManual';
import { FLUXOS } from './fluxos';
import estilos from './page.module.css';
import { SECOES } from './secoes';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/manual',
  title: 'Manual · Lumens',
  description: 'Como usar o Lumens: pautas, apoios, caminhos, Fala.BR e protocolo, passo a passo.',
});

// Os textos do Fala.BR (o que é, por que a pauta vai para lá e os 3 passos) repetem, palavra por
// palavra, os que o bot manda ao abrir o caminho: `OPENED_TEXT.falabr`, em
// apps/backend/src/bot/conversation/minhas-pautas.ts. O teste da página confere os dois lados:
// se um mudar, mude o outro. Prazo: 30 dias, prorrogáveis uma vez por mais 30 (protocolo-falabr.ts).

const CHAVES = Object.keys(SECOES) as (keyof typeof SECOES)[];
const NUMERO = Object.fromEntries(
  CHAVES.map((chave, i) => [chave, String(i + 1).padStart(2, '0')]),
) as Record<keyof typeof SECOES, string>;

const HUD: ItemDoHud[] = CHAVES.map((chave) => ({
  id: SECOES[chave].id,
  rotulo: SECOES[chave].titulo,
  numero: NUMERO[chave],
}));

/** Uma seção do manual: âncora no `id`, título ligado à região para o leitor de tela. */
function Secao({ chave, children }: { chave: keyof typeof SECOES; children: ReactNode }) {
  const { id, titulo } = SECOES[chave];
  return (
    <section className={estilos.secao} id={id} aria-labelledby={`titulo-${id}`}>
      <h2 id={`titulo-${id}`} className={estilos.secaoTitulo} data-numero={NUMERO[chave]}>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function ItemLista({ icone, children }: { icone: NomeDoIcone; children: ReactNode }) {
  return (
    <li>
      <span className={estilos.listaIcone} aria-hidden="true">
        <Icone nome={icone} />
      </span>
      <div>{children}</div>
    </li>
  );
}

export default function Manual() {
  const canal = nomeDoCanal();
  return (
    <FundoInterno mapa={<CampusInterno />} modo="passeio" className={estilos.raiz}>
      <Hud itens={HUD} rotulo="Assuntos do manual" sempreAberto />
      <main className={internas.conteudo}>
        <div className={internas.cabeca}>
          <p className={internas.sobre}>
            <Icone nome="documento" />
            Manual do Lumens
          </p>
          <h1>
            Tudo que pode gerar dúvida, <em>em poucas palavras</em>
          </h1>
          <p className={internas.sub}>
            No site e no bot do {canal}. Escolha o assunto no índice, ou siga rolando.
          </p>
        </div>

        <div className={estilos.texto}>
          <Secao chave="fluxos">
            <p>
              Escolha o que você quer fazer e ande pelos passos: cada um diz se é no bot, no site ou
              automático. Toque num passo ou role para ver o exemplo na conversa.
            </p>
            <FluxosDoManual fluxos={FLUXOS} canal={canal} rotulo="Passo a passo do Lumens" />
          </Secao>

          <Secao chave="pauta">
            <p>
              Pauta é um problema do campus, escrito de forma pública: o que acontece, onde e desde
              quando. Cada pauta mostra quantas pessoas a apoiam, em que etapa está e o que já foi
              feito para resolvê-la.
            </p>
            <p>
              Nenhum nome, telefone ou e-mail de quem participa aparece no site. Quanto mais gente
              apoia, mais força a pauta tem para ser cobrada.
            </p>
          </Secao>

          <Secao chave="relatar">
            <p>Tudo isso é feito pelo bot do {canal}. Mande uma mensagem e use o menu:</p>
            <ul className={estilos.lista}>
              <ItemLista icone="conversa">
                <strong>Relatar problema</strong>: conte o que você encontrou. O bot procura pautas
                abertas parecidas. Se for o mesmo problema, é só apoiar a que já existe. Se não for,
                você cria uma pauta nova.
              </ItemLista>
              <ItemLista icone="apoio">
                <strong>Apoiar</strong>: abra uma pauta no site e toque em <em>Apoiar</em>. A
                conversa volta para o bot com a pauta certa. O apoio conta na hora.
              </ItemLista>
              <ItemLista icone="relato">
                <strong>Relato e fotos</strong>: depois de apoiar, você pode contar a sua
                experiência e mandar <strong>até 3 fotos</strong>, uma por mensagem. A cada foto, o
                bot pergunta se tem mais alguma; responda <em>pronto</em> para terminar. Tudo
                aparece no site depois de aprovado pela moderação, sem o seu nome. A curadoria pode
                recusar uma foto sem recusar o texto: nesse caso o bot manda o motivo da recusa
                daquela foto para você.
              </ItemLista>
              <ItemLista icone="email">
                <strong>Verificar e-mail</strong>: apoiar, criar pauta e cuidar de pauta pedem que
                você verifique o seu e-mail institucional (<code>@ufal.br</code>). O bot manda um
                código e você responde com ele.
              </ItemLista>
            </ul>
            <p className={estilos.nota}>
              A qualquer momento, mande <strong>menu</strong> para ver as opções,{' '}
              <strong>ajuda</strong> para ver os comandos ou <strong>cancelar</strong> para voltar
              ao começo.
            </p>
          </Secao>

          <Secao chave="perdido">
            <p>
              Errou uma resposta ou não sabe o que mandar? O bot nunca deixa você preso. Em qualquer
              momento:
            </p>
            <ul className={estilos.lista}>
              <ItemLista icone="lista">
                Mande <strong>menu</strong> (ou <em>menu principal</em>, <em>voltar ao menu</em>,{' '}
                <em>início</em>) para voltar ao começo. O que você estava fazendo é descartado.
              </ItemLista>
              <ItemLista icone="anterior">
                Nas listas de opções há sempre a opção <strong>0</strong>,{' '}
                <em>Voltar ao menu principal</em>.
              </ItemLista>
              <ItemLista icone="fechar">
                Mande <strong>cancelar</strong> (ou <em>desistir</em>) para largar o que estava
                fazendo.
              </ItemLista>
              <ItemLista icone="conversa">
                No menu, você pode escrever o que quer fazer, como{' '}
                <em>quero criar uma nova pauta</em> ou <em>quero relatar um problema</em>: o bot
                leva você para a opção certa.
              </ItemLista>
              <ItemLista icone="visto">
                Para escolher uma opção, vale o número (<em>2</em>), o número por extenso (
                <em>dois</em>, <em>a segunda</em>, <em>opção 2</em>) ou o nome da opção.
              </ItemLista>
              <ItemLista icone="lampada">
                Depois de três respostas seguidas que o bot não entendeu na mesma pergunta, ele
                lembra como sair.
              </ItemLista>
            </ul>
          </Secao>

          <Secao chave="editar">
            <p>
              Esqueceu algo ou errou uma palavra? No menu, escolha <strong>Editar pauta</strong>{' '}
              (opção 6) e depois <em>Título</em> ou <em>Descrição</em>.
            </p>
            <ul className={estilos.lista}>
              <ItemLista icone="lapis">
                <strong>Enquanto a curadoria ainda não decidiu</strong>, o texto muda na hora. Assim
                o texto corrigido é exatamente o que ela vai conferir.
              </ItemLista>
              <ItemLista icone="escudo">
                <strong>Depois que a pauta é publicada</strong>, o texto público não muda sozinho:
                quem já apoiou apoiou aquele texto. O seu pedido vai para a curadoria, que vê o
                texto de antes e o de depois e aprova ou recusa. Só quando ela aprova o texto novo
                vai ao site. Até lá, vale o texto que já está publicado.
              </ItemLista>
              <ItemLista icone="sino">
                Dá para ter um pedido esperando por vez em cada campo (título e descrição). Você
                recebe a decisão pelo bot; se for recusa, vem o motivo.
              </ItemLista>
            </ul>
          </Secao>

          <Secao chave="categoria">
            <p>
              Toda pauta tem uma categoria, como infraestrutura, para quem lê achar problemas do
              mesmo tipo. Ao criar uma pauta, o bot lê o seu texto e sugere uma: &ldquo;Parece ser
              Infraestrutura. Confirma?&rdquo;.
            </p>
            <ul className={estilos.lista}>
              <ItemLista icone="visto">
                <strong>Confirmar</strong> aceita a sugestão.
              </ItemLista>
              <ItemLista icone="etiqueta">
                <strong>Escolher outra</strong> abre a lista de categorias para você decidir. A
                sugestão é só um palpite: a decisão é sua.
              </ItemLista>
              <ItemLista icone="escudo">
                <strong>Outra</strong>, na lista, serve para o que não se encaixa. A curadoria
                define a categoria quando for conferir a pauta.
              </ItemLista>
            </ul>
            <p>
              Antes de aparecer no site, a curadoria confere a pauta e avisa você da decisão, em até
              24 horas.
            </p>
          </Secao>

          <Secao chave="caminhos">
            <p>
              Caminho é o jeito escolhido para levar a pauta adiante. Quem cuida da pauta pode abrir
              mais de um ao mesmo tempo:
            </p>
            <ul className={estilos.caminhos}>
              <li>
                <Icone nome="predioPublico" />
                <b>Fala.BR</b>
                <p>
                  Canal oficial do governo federal para registrar manifestações. A resposta tem
                  prazo em lei e o protocolo fica público. Veja{' '}
                  <a href={`#${SECOES.falabr.id}`}>os passos</a>.
                </p>
              </li>
              <li>
                <Icone nome="pessoas" />
                <b>Solução da comunidade</b>
                <p>Estudantes resolvendo o problema por conta própria.</p>
              </li>
              <li>
                <Icone nome="megafone" />
                <b>Representante</b>
                <p>
                  Alguém que representa os estudantes leva a pauta à universidade e cobra uma
                  resposta.
                </p>
              </li>
              <li>
                <Icone nome="acordo" />
                <b>Proposta da comunidade</b>
                <p>
                  Ideia de solução publicada por quem cuida da pauta. Enquanto está aberta, precisa
                  de voluntários: toque em <em>Vou ajudar</em>.
                </p>
              </li>
            </ul>
            <div className={estilos.regra}>
              <Icone nome="escudo" />
              <p>
                <strong>Regra:</strong> uma solução da comunidade nunca fecha a pauta. A cobrança
                continua até a universidade resolver, e só vira conquista quando a maioria de quem
                respondeu à conferência confirma. Para valer, pelo menos 10% de quem apoiou precisa
                responder.
              </p>
            </div>
          </Secao>

          <Secao chave="falabr">
            <p>O Fala.BR é o canal oficial do governo federal para registrar manifestações.</p>
            <p>
              É para lá que a pauta vai porque a ouvidoria da UFAL tem prazo legal para responder. O
              encaminhamento é feito por você, no site do Fala.BR, e o bot ajuda no caminho. Faltam
              3 passos:
            </p>
            <ol className={estilos.passosNumerados}>
              <li>
                <div>
                  Copie o texto da manifestação, que mando logo depois (se eu não conseguir
                  montá-lo, aviso).
                </div>
              </li>
              <li>
                <div>
                  Entre em <a href="https://falabr.cgu.gov.br">https://falabr.cgu.gov.br</a> e cole
                  no campo &quot;Descrição&quot; de uma nova manifestação.
                </div>
              </li>
              <li>
                <div>
                  Ao enviar, o Fala.BR dá um número de protocolo. Guarde e mande aqui em{' '}
                  <strong>Registrar protocolo</strong>: é com ele que a pauta passa a ser cobrada.
                </div>
              </li>
            </ol>
            <p className={estilos.nota}>
              Os passos acima são os mesmos que o bot manda ao abrir o caminho, por isso falam em
              &ldquo;mando&rdquo; e &ldquo;aqui&rdquo;.
            </p>
            <p>
              O Fala.BR é público, então o texto não pode levar dado de ninguém. O bot troca e-mail,
              telefone e matrícula por [removido]. Possíveis nomes de pessoa ficam no texto e o bot
              avisa quais são: revise e apague os nomes antes de enviar.
            </p>
            <p>
              <strong>Prazo:</strong> a ouvidoria tem 30 dias para responder, contados do dia em que
              a manifestação foi registrada, e pode prorrogar uma vez por mais 30. Por isso o bot
              pergunta em que dia você registrou.
            </p>
          </Secao>

          <Secao chave="protocolo">
            <p>
              Protocolo é o número que o Fala.BR dá quando a manifestação é enviada. Ele prova que o
              pedido foi feito e permite cobrar a resposta.
            </p>
            <p>
              Quem cuida da pauta informa o número ao bot, em <strong>Minhas pautas</strong>. A
              partir daí a pauta mostra o protocolo e o prazo de resposta, e qualquer pessoa pode
              acompanhar.
            </p>
          </Secao>

          <Secao chave="cuidar">
            <p>
              Quem cuida de uma pauta recebe os avisos e escolhe os próximos passos pelo bot, em{' '}
              <strong>Minhas pautas</strong>: abrir um caminho, pedir o texto do Fala.BR e registrar
              o protocolo. Quem cria a pauta passa a cuidar dela.
            </p>
            <ul className={estilos.lista}>
              <ItemLista icone="pessoas">
                Até <strong>3 pessoas</strong> cuidam de cada pauta.
              </ItemLista>
              <ItemLista icone="apoio">
                Depois de apoiar, se houver vaga, o bot convida você com <em>Quero cuidar</em>. Você
                também pode mandar <strong>cuidar</strong> seguido do código da pauta.
              </ItemLista>
              <ItemLista icone="email">É preciso ter o e-mail institucional verificado.</ItemLista>
            </ul>
          </Secao>

          <Secao chave="privacidade">
            <ul className={estilos.lista}>
              <ItemLista icone="olho">
                O site nunca mostra nome, telefone ou e-mail de quem apoia ou relata.
              </ItemLista>
              <ItemLista icone="escudo">
                Os dados da conversa e o seu e-mail ficam cifrados no banco.
              </ItemLista>
              <ItemLista icone="local">
                As fotos perdem a localização antes de serem guardadas.
              </ItemLista>
              <ItemLista icone="vistoSelo">
                Relatos e fotos só aparecem depois de aprovados pela moderação, e cada foto é
                analisada sozinha.
              </ItemLista>
            </ul>
            <p>
              O Lumens é um projeto acadêmico e não fala em nome da UFAL. Para os detalhes, leia a{' '}
              <Link href="/privacidade">política de privacidade</Link>.
            </p>
          </Secao>
        </div>
      </main>
    </FundoInterno>
  );
}

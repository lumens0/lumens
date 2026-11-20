import type { Metadata } from 'next';
import Link from 'next/link';
import { Fluxos } from '@lumens/marca/fluxo';
import { metadadosDaMarca } from '../../metadados';
import { nomeDoCanal } from '../../whatsapp';
import estilos from './page.module.css';
import { FLUXOS } from './fluxos';
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

/** Uma seção do manual: âncora no `id`, título ligado à região para o leitor de tela. */
function Secao({ chave, children }: { chave: keyof typeof SECOES; children: React.ReactNode }) {
  const { id, titulo } = SECOES[chave];
  return (
    <section className={estilos.secao} id={id} aria-labelledby={`titulo-${id}`}>
      <h2 id={`titulo-${id}`} className={estilos.secaoTitulo}>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export default function Manual() {
  const canal = nomeDoCanal();
  return (
    <main className={estilos.pagina}>
      <h1 className={estilos.titulo}>Manual</h1>
      <p className={estilos.resumo}>
        Como relatar, apoiar e cuidar de uma pauta, passo a passo, no site e no bot do {canal}.
        Toque no assunto para ir direto a ele.
      </p>

      <nav aria-label="Assuntos do manual">
        <ul className={estilos.sumario}>
          {Object.values(SECOES).map(({ id, titulo }) => (
            <li key={id}>
              <a href={`#${id}`}>{titulo}</a>
            </li>
          ))}
        </ul>
      </nav>

      <Secao chave="fluxos">
        <p>
          Escolha o que você quer fazer e siga os passos: cada um diz se acontece no bot, no site ou
          sozinho. Toque em “Saiba mais” para ver os detalhes.
        </p>
        <Fluxos fluxos={FLUXOS} rotulo="Passo a passo do Lumens" rotuloDoBot={canal} />
      </Secao>

      <Secao chave="pauta">
        <p>
          Pauta é um problema do campus, escrito de forma pública: o que acontece, onde e desde
          quando. Cada pauta mostra quantas pessoas a apoiam, em que etapa está e o que já foi feito
          para resolvê-la.
        </p>
        <p>
          Nenhum nome, telefone ou e-mail de quem participa aparece no site. Quanto mais gente
          apoia, mais força a pauta tem para ser cobrada.
        </p>
      </Secao>

      <Secao chave="relatar">
        <p>Tudo isso é feito pelo bot do {canal}. Mande uma mensagem e use o menu:</p>
        <ul>
          <li>
            <strong>Relatar problema</strong>: conte o que você encontrou. O bot procura pautas
            abertas parecidas. Se for o mesmo problema, é só apoiar a que já existe. Se não for,
            você cria uma pauta nova.
          </li>
          <li>
            <strong>Apoiar</strong>: abra uma pauta no site e toque em <em>Apoiar</em>. A conversa
            volta para o bot com a pauta certa. O apoio conta na hora.
          </li>
          <li>
            <strong>Relato e fotos</strong>: depois de apoiar, você pode contar a sua experiência e
            mandar <strong>até 3 fotos</strong>, uma por mensagem. A cada foto, o bot pergunta se
            tem mais alguma; responda <em>pronto</em> para terminar. Tudo aparece no site depois de
            aprovado pela moderação, sem o seu nome. A curadoria pode recusar uma foto sem recusar o
            texto: nesse caso o bot manda o motivo da recusa daquela foto para você.
          </li>
          <li>
            <strong>Verificar e-mail</strong>: apoiar, criar pauta e cuidar de pauta pedem que você
            verifique o seu e-mail institucional (<code>@ufal.br</code>). O bot manda um código e
            você responde com ele.
          </li>
        </ul>
        <p className={estilos.nota}>
          A qualquer momento, mande <strong>menu</strong> para ver as opções, <strong>ajuda</strong>{' '}
          para ver os comandos ou <strong>cancelar</strong> para voltar ao começo.
        </p>
      </Secao>

      <Secao chave="perdido">
        <p>
          Errou uma resposta ou não sabe o que mandar? O bot nunca deixa você preso. Em qualquer
          momento:
        </p>
        <ul>
          <li>
            Mande <strong>menu</strong> (ou <em>menu principal</em>, <em>voltar ao menu</em>,{' '}
            <em>início</em>) para voltar ao começo. O que você estava fazendo é descartado.
          </li>
          <li>
            Nas listas de opções há sempre a opção <strong>0</strong>,{' '}
            <em>Voltar ao menu principal</em>.
          </li>
          <li>
            Mande <strong>cancelar</strong> (ou <em>desistir</em>) para largar o que estava fazendo.
          </li>
          <li>
            No menu, você pode escrever o que quer fazer, como <em>quero criar uma nova pauta</em>{' '}
            ou <em>quero relatar um problema</em>: o bot leva você para a opção certa.
          </li>
          <li>
            Para escolher uma opção, vale o número (<em>2</em>), o número por extenso (<em>dois</em>
            , <em>a segunda</em>, <em>opção 2</em>) ou o nome da opção.
          </li>
          <li>
            Depois de três respostas seguidas que o bot não entendeu na mesma pergunta, ele lembra
            como sair.
          </li>
        </ul>
      </Secao>

      <Secao chave="editar">
        <p>
          Esqueceu algo ou errou uma palavra? No menu, escolha <strong>Editar pauta</strong> (opção
          6) e depois <em>Título</em> ou <em>Descrição</em>.
        </p>
        <ul>
          <li>
            <strong>Enquanto a curadoria ainda não decidiu</strong>, o texto muda na hora. Assim o
            texto corrigido é exatamente o que ela vai conferir.
          </li>
          <li>
            <strong>Depois que a pauta é publicada</strong>, o texto público não muda sozinho: quem
            já apoiou apoiou aquele texto. O seu pedido vai para a curadoria, que vê o texto de
            antes e o de depois e aprova ou recusa. Só quando ela aprova o texto novo vai ao site.
            Até lá, vale o texto que já está publicado.
          </li>
          <li>
            Dá para ter um pedido esperando por vez em cada campo (título e descrição). Você recebe
            a decisão pelo bot; se for recusa, vem o motivo.
          </li>
        </ul>
      </Secao>

      <Secao chave="categoria">
        <p>
          Toda pauta tem uma categoria, como infraestrutura, para quem lê achar problemas do mesmo
          tipo. Ao criar uma pauta, o bot lê o seu texto e sugere uma: &ldquo;Parece ser
          Infraestrutura. Confirma?&rdquo;.
        </p>
        <ul>
          <li>
            <strong>Confirmar</strong> aceita a sugestão.
          </li>
          <li>
            <strong>Escolher outra</strong> abre a lista de categorias para você decidir. A sugestão
            é só um palpite: a decisão é sua.
          </li>
          <li>
            <strong>Outra</strong>, na lista, serve para o que não se encaixa. A curadoria define a
            categoria quando for conferir a pauta.
          </li>
        </ul>
        <p>
          Antes de aparecer no site, a curadoria confere a pauta e avisa você da decisão, em até 24
          horas.
        </p>
      </Secao>

      <Secao chave="caminhos">
        <p>
          Caminho é o jeito escolhido para levar a pauta adiante. Quem cuida da pauta pode abrir
          mais de um ao mesmo tempo:
        </p>
        <ul>
          <li>
            <strong>Fala.BR</strong>: canal oficial do governo federal para registrar manifestações.
            A resposta tem prazo em lei e o protocolo fica público. Veja{' '}
            <a href={`#${SECOES.falabr.id}`}>os passos</a>.
          </li>
          <li>
            <strong>Solução da comunidade</strong>: estudantes resolvendo o problema por conta
            própria.
          </li>
          <li>
            <strong>Representante</strong>: alguém que representa os estudantes leva a pauta à
            universidade e cobra uma resposta.
          </li>
          <li>
            <strong>Proposta da comunidade</strong>: ideia de solução publicada por quem cuida da
            pauta. Enquanto está aberta, precisa de voluntários: toque em <em>Vou ajudar</em>.
          </li>
        </ul>
        <p>
          <strong>Regra:</strong> uma solução da comunidade nunca fecha a pauta. A cobrança continua
          até a universidade resolver, e só vira conquista quando a maioria de quem respondeu à
          conferência confirma. Para valer, pelo menos 10% de quem apoiou precisa responder.
        </p>
      </Secao>

      <Secao chave="falabr">
        <p>O Fala.BR é o canal oficial do governo federal para registrar manifestações.</p>
        <p>
          É para lá que a pauta vai porque a ouvidoria da UFAL tem prazo legal para responder. O
          encaminhamento é feito por você, no site do Fala.BR, e o bot ajuda no caminho. Faltam 3
          passos:
        </p>
        <ol className={estilos.passos}>
          <li>
            Copie o texto da manifestação, que mando logo depois (se eu não conseguir montá-lo,
            aviso).
          </li>
          <li>
            Entre em <a href="https://falabr.cgu.gov.br">https://falabr.cgu.gov.br</a> e cole no
            campo &quot;Descrição&quot; de uma nova manifestação.
          </li>
          <li>
            Ao enviar, o Fala.BR dá um número de protocolo. Guarde e mande aqui em{' '}
            <strong>Registrar protocolo</strong>: é com ele que a pauta passa a ser cobrada.
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
          <strong>Prazo:</strong> a ouvidoria tem 30 dias para responder, contados do dia em que a
          manifestação foi registrada, e pode prorrogar uma vez por mais 30. Por isso o bot pergunta
          em que dia você registrou.
        </p>
      </Secao>

      <Secao chave="protocolo">
        <p>
          Protocolo é o número que o Fala.BR dá quando a manifestação é enviada. Ele prova que o
          pedido foi feito e permite cobrar a resposta.
        </p>
        <p>
          Quem cuida da pauta informa o número ao bot, em <strong>Minhas pautas</strong>. A partir
          daí a pauta mostra o protocolo e o prazo de resposta, e qualquer pessoa pode acompanhar.
        </p>
      </Secao>

      <Secao chave="cuidar">
        <p>
          Quem cuida de uma pauta recebe os avisos e escolhe os próximos passos pelo bot, em{' '}
          <strong>Minhas pautas</strong>: abrir um caminho, pedir o texto do Fala.BR e registrar o
          protocolo. Quem cria a pauta passa a cuidar dela.
        </p>
        <ul>
          <li>
            Até <strong>3 pessoas</strong> cuidam de cada pauta.
          </li>
          <li>
            Depois de apoiar, se houver vaga, o bot convida você com <em>Quero cuidar</em>. Você
            também pode mandar <strong>cuidar</strong> seguido do código da pauta.
          </li>
          <li>É preciso ter o e-mail institucional verificado.</li>
        </ul>
      </Secao>

      <Secao chave="privacidade">
        <ul>
          <li>O site nunca mostra nome, telefone ou e-mail de quem apoia ou relata.</li>
          <li>Os dados da conversa e o seu e-mail ficam cifrados no banco.</li>
          <li>As fotos perdem a localização antes de serem guardadas.</li>
          <li>
            Relatos e fotos só aparecem depois de aprovados pela moderação, e cada foto é analisada
            sozinha.
          </li>
        </ul>
        <p>
          O Lumens é um projeto acadêmico e não fala em nome da UFAL. Para os detalhes, leia a{' '}
          <Link href="/privacidade">política de privacidade</Link>.
        </p>
      </Secao>
    </main>
  );
}

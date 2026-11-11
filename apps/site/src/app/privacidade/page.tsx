import type { Metadata } from 'next';
import { metadadosDaMarca } from '../../metadados';
import Link from 'next/link';
import estilos from './page.module.css';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/privacidade',
  title: 'Política de privacidade · Lumens',
  description: 'Que dados o Lumens coleta, como protege e o que aparece no site público.',
});

// Esta página descreve o comportamento REAL do sistema, não intenções. Cada
// afirmação abaixo corresponde a código em produção; a referência está no
// comentário de cada seção. Ao mudar o comportamento, mude este texto junto —
// uma política que descreve o que o sistema não faz é pior que não ter uma.
const ATUALIZADA_EM = '10 de novembro de 2026';

export default function Privacidade() {
  return (
    <main className={estilos.pagina}>
      <p className={estilos.rotulo}>Atualizada em {ATUALIZADA_EM}</p>
      <h1 className={estilos.titulo}>Política de privacidade</h1>
      <p className={estilos.resumo}>
        O Lumens recebe relatos de estudantes da UFAL pelo WhatsApp e transforma os que juntam apoio
        em pautas públicas. Esta página diz quais dados isso envolve e o que o sistema faz com eles.
      </p>

      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Quem somos</h2>
        <p>
          O Lumens é um projeto acadêmico, desenvolvido por estudantes do curso de computação da
          Universidade Federal de Alagoas como trabalho de disciplina. Não é um canal oficial da
          UFAL e não fala em nome da universidade.
        </p>
        <p>
          O sistema está em desenvolvimento, mas o que você envia ao bot chega e é guardado. Por
          isso esta página descreve o que acontece de verdade hoje, não o que está planejado.
        </p>
      </section>

      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>O que coletamos</h2>
        {/* Verificação: apps/backend/src/bot/conversation/verificacao.ts (2.4) */}
        <p>De quem conversa com o bot:</p>
        <ul>
          <li>
            <strong>Seu número de telefone</strong>, que chega junto com cada mensagem
          </li>
          <li>
            <strong>O que você responde durante um fluxo</strong> (um relato, o título de uma
            pauta), guardado só enquanto a conversa dura
          </li>
        </ul>
        <p>Se você se verificar como estudante:</p>
        <ul>
          <li>
            <strong>Seu e-mail institucional</strong> (<code>@ufal.br</code>), para onde mandamos um
            código. O código é guardado só como resumo irreversível e vale por pouco tempo
          </li>
          <li>
            <strong>Seu curso</strong>, escolhido numa lista
          </li>
          <li>
            <strong>O que você faz no Lumens</strong>: os apoios que dá, os relatos que envia e as
            pautas que cria ou de que cuida
          </li>
        </ul>
      </section>

      {/* AES-256-GCM e HMAC-SHA256: apps/backend/src/cripto.ts */}
      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Como protegemos</h2>
        <ul>
          <li>
            <strong>Seu telefone e seu e-mail são cifrados</strong> no banco, com AES-256-GCM, assim
            como o conteúdo das mensagens e as respostas que o bot envia.
          </li>
          <li>
            <strong>A busca pelo seu telefone não decifra nada.</strong> Guardamos também um código
            irreversível derivado do número (HMAC-SHA256), e é por ele que o sistema reencontra sua
            conversa.
          </li>
          <li>
            <strong>O estado da conversa dura 24 horas.</strong> Depois disso ele expira, e uma
            rotina diária apaga o que expirou.
          </li>
        </ul>
      </section>

      {/* baixar → removerMetadados → guardar: apps/backend/src/fotos/servico.ts */}
      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Fotos</h2>
        <p>
          A foto que você manda para uma pauta nova é publicada com ela. Antes de guardar,{' '}
          <strong>removemos os metadados</strong> do arquivo (EXIF), inclusive a localização de onde
          a foto foi tirada. Mesmo assim, confira se a imagem não mostra rosto, placa ou documento
          de alguém.
        </p>
      </section>

      {/* Decisão e texto do aviso: docs/decisoes/SCRUM-174-aviso-de-privacidade.md */}
      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Base legal</h2>
        <p>
          O Lumens trata seus dados com base no seu <strong>consentimento</strong> (Lei Geral de
          Proteção de Dados, art. 7º, I). O bot mostra um aviso no primeiro contato, antes de
          qualquer cadastro, e você consente quando se verifica: ao digitar seu e-mail institucional
          e o código que mandamos para ele.
        </p>
        <p>
          Antes de se verificar, guardamos só o necessário para responder a quem nos procurou: o
          telefone e a conversa em andamento, que expira em 24 horas. Você pode retirar o
          consentimento a qualquer momento, do mesmo jeito simples: enviando <strong>sair</strong>.
        </p>
      </section>

      {/* owners só com papel e curso: apps/site/src/dados/tipos.ts
          em_curadoria e recusada fora do site: apps/site/src/dados/pautas-publicas.ts */}
      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>O que aparece no site</h2>
        <p>
          O site mostra a pauta, o status, o bloco, a contagem de apoios e a meta. Sobre as pessoas
          responsáveis por uma pauta, mostra <strong>apenas o papel e o curso</strong> — nunca nome,
          telefone, e-mail ou matrícula.
        </p>
        <p>
          Quem apoia uma pauta <strong>não aparece</strong>. O site publica o total de apoios, não
          quem apoiou.
        </p>
        <p>
          Pautas em curadoria ou recusadas não são publicadas. Enquanto uma pauta não é aprovada,
          ela não existe para quem visita o site.
        </p>
      </section>

      {/* RN08: conferirAnonimato roda dentro de montarTextoFalaBr (texto-falabr.ts), mas nenhum
          fluxo do bot chama esse gerador ainda. Por isso o parágrafo final. */}
      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Quando a pauta vai para o Fala.BR</h2>
        <p>
          Pautas que atingem a meta poderão ser levadas ao Fala.BR, o sistema federal de
          manifestações. Isso é feito manualmente por uma pessoa responsável, e o texto protocolado
          vira documento público.
        </p>
        <p>
          Por isso, o gerador desse texto já inclui uma conferência que{' '}
          <strong>bloqueia o envio</strong> se encontrar nome de pessoa que o sistema conhece,
          e-mail, telefone ou matrícula. Trechos que apenas sugerem um nome geram um aviso para quem
          revisa decidir.
        </p>
        <p>
          Nenhuma pauta foi levada ao Fala.BR até hoje: esse fluxo ainda não está em funcionamento.
        </p>
      </section>

      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Com quem compartilhamos</h2>
        <p>
          Com ninguém, para fins comerciais ou de publicidade. As mensagens passam pela
          infraestrutura do WhatsApp, operada pela Meta, porque é por lá que a conversa acontece.
        </p>
      </section>

      <section className={estilos.secao}>
        <h2 className={estilos.secaoTitulo}>Seus direitos</h2>
        {/* Comando 'sair': apps/backend/src/bot/conversation/privacidade.ts → sairDoLumens */}
        <p>
          Para sair do Lumens, envie <strong>sair</strong> na conversa com o bot e confirme. Na
          hora, apagamos seu telefone e seu e-mail (inclusive as versões cifradas), sua conversa e o
          código de verificação, e você deixa de ser responsável pelas pautas que cuidava.
        </p>
        <p>
          Os apoios que você deu continuam contando, mas sem nenhuma ligação com você. Pautas já
          publicadas, que não carregam seus dados pessoais, permanecem no site.
        </p>
        <p>
          Para ver ou corrigir os dados que temos sobre você, peça pelo mesmo canal do WhatsApp: o
          pedido é atendido manualmente pela equipe.
        </p>
      </section>

      <Link href="/" className={estilos.voltar}>
        ← Voltar para as pautas
      </Link>
    </main>
  );
}

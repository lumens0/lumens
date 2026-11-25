import Link from 'next/link';
import estilos from '../../page.module.css';

// A mesma tela para qualquer e-mail digitado: não revela quem é da curadoria. Quem não é recebe o
// aviso no próprio e-mail (SCRUM-400), e o texto abaixo explica a regra sem dizer de quem é.
export default function Verifique() {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao} aria-labelledby="titulo-verifique">
        <p className={estilos.marca}>
          <img src="/lumens-marca.svg" alt="" width={44} height={44} className={estilos.logo} />
          <span>
            Lumens <span>Curadoria</span>
          </span>
        </p>
        <h1 id="titulo-verifique">Verifique seu e-mail</h1>
        <p className={estilos.descricao} role="status">
          Só e-mails cadastrados pela curadoria recebem o link de acesso. Ele vale por 15 minutos e
          só pode ser usado uma vez.
        </p>
        <p className={estilos.pequeno}>
          Não chegou em alguns minutos? Veja a caixa de spam. Se o endereço não estiver na lista,
          enviamos para ele um aviso dizendo isso (no máximo um por hora). Para entrar na lista,
          peça a quem coordena a curadoria.
        </p>
        <p className={estilos.pequeno}>
          <Link href="/login">Usar outro e-mail</Link>
        </p>
      </section>
    </main>
  );
}

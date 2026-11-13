import { caminhoDoArquivo } from './curadoria/arquivos/[...chave]/arquivo';
import estilos from './painel.module.css';

/**
 * Foto do relato para a curadoria conferir antes de aprovar (SCRUM-262). Vem pela rota que exige
 * sessão; tocar abre a imagem inteira em outra aba.
 */
export function Foto({ chave }: { chave: string }) {
  const caminho = caminhoDoArquivo(chave);
  return (
    <a href={caminho} target="_blank" rel="noreferrer" className={estilos.foto}>
      {/* Arquivo privado, atrás da sessão: o otimizador de imagem do Next não teria acesso. */}
      <img src={caminho} alt="Foto enviada com o relato" loading="lazy" />
    </a>
  );
}

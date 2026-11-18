'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Botão de enviar que fica desabilitado enquanto o formulário está indo. Sem isso, o duplo clique
 * dispara a ação duas vezes: a segunda recebe "já decidida" e o último redirecionamento vence,
 * mostrando um erro falso no lugar da confirmação (SCRUM-305).
 */
export function Enviar({
  children,
  className,
  desabilitado = false,
  title,
}: {
  children: ReactNode;
  className?: string | undefined;
  desabilitado?: boolean;
  title?: string | undefined;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-disabled={pending || desabilitado}
      className={className}
      disabled={pending || desabilitado}
      title={title}
      type="submit"
    >
      {children}
    </button>
  );
}

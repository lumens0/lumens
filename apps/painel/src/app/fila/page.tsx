import { permanentRedirect } from 'next/navigation';

/** A fila virou o filtro "a decidir" da lista de pautas (SCRUM-286); links antigos continuam valendo. */
export default function Fila(): never {
  permanentRedirect('/pautas?status=em_curadoria');
}

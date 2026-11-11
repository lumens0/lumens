/** Todos os passos da conversa. No banco, `conversa.passo` é texto: a lista vale aqui. */
export const STEPS = [
  'GREETING',
  'MENU',
  'VERIFY_ASK_EMAIL',
  'VERIFY_ASK_CODE',
  'VERIFY_ASK_COURSE',
  'REPORT_ASK_TEXT',
  'REPORT_ASK_BLOCK',
  'REPORT_PICK_SIMILAR',
  'NEW_ASK_TITLE',
  'NEW_ASK_PLACE',
  'NEW_ASK_DESCRIPTION',
  'NEW_ASK_PHOTO',
  'OWNER_PICK_PAUTA',
  'OWNER_PATHS',
  'OWNER_ASK_PROTOCOL',
  'OWNER_ASK_PROTOCOL_DATE',
] as const;

export type Step = (typeof STEPS)[number];

export function isStep(valor: string): valor is Step {
  return (STEPS as readonly string[]).includes(valor);
}

/** "Enum" de passos (objeto const), checado contra STEPS em tempo de compilação. */
export const Step = {
  GREETING: 'GREETING',
  MENU: 'MENU',
  VERIFY_ASK_EMAIL: 'VERIFY_ASK_EMAIL',
  VERIFY_ASK_CODE: 'VERIFY_ASK_CODE',
  VERIFY_ASK_COURSE: 'VERIFY_ASK_COURSE',
  REPORT_ASK_TEXT: 'REPORT_ASK_TEXT',
  REPORT_ASK_BLOCK: 'REPORT_ASK_BLOCK',
  REPORT_PICK_SIMILAR: 'REPORT_PICK_SIMILAR',
  NEW_ASK_TITLE: 'NEW_ASK_TITLE',
  NEW_ASK_PLACE: 'NEW_ASK_PLACE',
  NEW_ASK_DESCRIPTION: 'NEW_ASK_DESCRIPTION',
  NEW_ASK_PHOTO: 'NEW_ASK_PHOTO',
  OWNER_PICK_PAUTA: 'OWNER_PICK_PAUTA',
  OWNER_PATHS: 'OWNER_PATHS',
  OWNER_ASK_PROTOCOL: 'OWNER_ASK_PROTOCOL',
  OWNER_ASK_PROTOCOL_DATE: 'OWNER_ASK_PROTOCOL_DATE',
} as const satisfies { [K in Step]: K };

/** Próximos passos permitidos a partir de cada passo (fora os globais). */
export const TRANSITIONS: Record<Step, readonly Step[]> = {
  GREETING: ['MENU'],
  MENU: ['VERIFY_ASK_EMAIL', 'REPORT_ASK_TEXT', 'NEW_ASK_TITLE', 'OWNER_PICK_PAUTA', 'OWNER_PATHS'],
  VERIFY_ASK_EMAIL: ['VERIFY_ASK_CODE'],
  VERIFY_ASK_CODE: ['VERIFY_ASK_COURSE', 'VERIFY_ASK_CODE'],
  VERIFY_ASK_COURSE: ['MENU'],
  // Os passos do relato repetem a pergunta quando a resposta não serve (relato vazio, bloco que
  // não existe, escolha fora da lista).
  REPORT_ASK_TEXT: ['REPORT_ASK_BLOCK', 'REPORT_PICK_SIMILAR', 'REPORT_ASK_TEXT'],
  REPORT_ASK_BLOCK: ['REPORT_PICK_SIMILAR', 'REPORT_ASK_BLOCK'],
  // Pauta nova vinda do relato passa pela verificação se a pessoa ainda não é verificada.
  REPORT_PICK_SIMILAR: ['MENU', 'NEW_ASK_TITLE', 'VERIFY_ASK_EMAIL', 'REPORT_PICK_SIMILAR'],
  // A pauta nova pula o local e a descrição quando vem do relato (2.5), e cada passo repete a
  // pergunta quando a resposta não serve (título longo, bloco que não existe...).
  NEW_ASK_TITLE: ['NEW_ASK_PLACE', 'NEW_ASK_DESCRIPTION', 'NEW_ASK_PHOTO', 'NEW_ASK_TITLE'],
  NEW_ASK_PLACE: ['NEW_ASK_DESCRIPTION', 'NEW_ASK_PLACE'],
  NEW_ASK_DESCRIPTION: ['NEW_ASK_PHOTO', 'NEW_ASK_DESCRIPTION'],
  NEW_ASK_PHOTO: ['MENU', 'NEW_ASK_PHOTO'],
  // 3.3: "Minhas pautas". Com uma pauta só, o menu vai direto aos caminhos. Os caminhos ficam no
  // mesmo passo depois de abrir um (o outro continua disponível) e voltam ao menu com os dois.
  OWNER_PICK_PAUTA: ['OWNER_PATHS', 'OWNER_PICK_PAUTA', 'MENU'],
  OWNER_PATHS: ['OWNER_PATHS', 'MENU', 'OWNER_ASK_PROTOCOL'],
  // Número e dia do protocolo (3.4). Cada passo repete a pergunta quando a resposta não serve.
  OWNER_ASK_PROTOCOL: ['OWNER_ASK_PROTOCOL_DATE', 'OWNER_ASK_PROTOCOL', 'OWNER_PATHS', 'MENU'],
  OWNER_ASK_PROTOCOL_DATE: ['OWNER_PATHS', 'OWNER_ASK_PROTOCOL_DATE', 'OWNER_ASK_PROTOCOL', 'MENU'],
};

/** Qualquer passo pode ir para estes via comandos globais ('menu', 'cancelar'). */
export const GLOBAL_TARGETS: readonly Step[] = ['GREETING', 'MENU'];

export class InvalidTransitionError extends Error {
  readonly from: Step;
  readonly to: Step;
  constructor(from: Step, to: Step) {
    super(`Transição inválida: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function canTransition(from: Step, to: Step): boolean {
  return GLOBAL_TARGETS.includes(to) || TRANSITIONS[from].includes(to);
}

/** Lança InvalidTransitionError se `from → to` não for permitido. */
export function assertTransition(from: Step, to: Step): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

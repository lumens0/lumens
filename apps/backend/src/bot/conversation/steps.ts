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
  'PROPOSAL_ASK_TEXT',
  'PROPOSAL_ASK_PEOPLE',
  'LEAVE_CONFIRM',
  'OWNER_ASK_PROTOCOL',
  'OWNER_ASK_PROTOCOL_DATE',
  'OWNER_SEND_RESPONSE',
  'SUPPORT_ASK_REPORT',
  'SUPPORT_ASK_PHOTO',
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
  PROPOSAL_ASK_TEXT: 'PROPOSAL_ASK_TEXT',
  PROPOSAL_ASK_PEOPLE: 'PROPOSAL_ASK_PEOPLE',
  LEAVE_CONFIRM: 'LEAVE_CONFIRM',
  OWNER_ASK_PROTOCOL: 'OWNER_ASK_PROTOCOL',
  OWNER_ASK_PROTOCOL_DATE: 'OWNER_ASK_PROTOCOL_DATE',
  OWNER_SEND_RESPONSE: 'OWNER_SEND_RESPONSE',
  SUPPORT_ASK_REPORT: 'SUPPORT_ASK_REPORT',
  SUPPORT_ASK_PHOTO: 'SUPPORT_ASK_PHOTO',
} as const satisfies { [K in Step]: K };

/** Próximos passos permitidos a partir de cada passo (fora os globais). */
export const TRANSITIONS: Record<Step, readonly Step[]> = {
  GREETING: ['MENU'],
  MENU: ['VERIFY_ASK_EMAIL', 'REPORT_ASK_TEXT', 'NEW_ASK_TITLE', 'OWNER_PICK_PAUTA', 'OWNER_PATHS'],
  // 2.4: e-mail recusado pergunta de novo no mesmo passo.
  VERIFY_ASK_EMAIL: ['VERIFY_ASK_CODE', 'VERIFY_ASK_EMAIL'],
  // 2.4: código errado, vencido ou "reenviar" ficam no passo; sem o e-mail na conversa, volta a ele.
  VERIFY_ASK_CODE: ['VERIFY_ASK_COURSE', 'VERIFY_ASK_CODE', 'VERIFY_ASK_EMAIL'],
  // 2.4: curso fora da lista pergunta de novo; verificado, retoma a pauta nova ou volta ao menu.
  // 2.7: com um apoio pedido antes da verificação, vai direto para o relato do apoio.
  VERIFY_ASK_COURSE: [
    'MENU',
    'VERIFY_ASK_COURSE',
    'NEW_ASK_TITLE',
    'VERIFY_ASK_EMAIL',
    'SUPPORT_ASK_REPORT',
  ],
  // Os passos do relato repetem a pergunta quando a resposta não serve (relato vazio, bloco que
  // não existe, escolha fora da lista).
  REPORT_ASK_TEXT: ['REPORT_ASK_BLOCK', 'REPORT_PICK_SIMILAR', 'REPORT_ASK_TEXT'],
  REPORT_ASK_BLOCK: ['REPORT_PICK_SIMILAR', 'REPORT_ASK_BLOCK'],
  // Pauta nova ou apoio vindos do relato passam pela verificação se a pessoa ainda não é
  // verificada. O apoio (2.7) segue para o relato opcional.
  REPORT_PICK_SIMILAR: [
    'MENU',
    'NEW_ASK_TITLE',
    'VERIFY_ASK_EMAIL',
    'REPORT_PICK_SIMILAR',
    'SUPPORT_ASK_REPORT',
  ],
  // A pauta nova pula o local e a descrição quando vem do relato (2.5), e cada passo repete a
  // pergunta quando a resposta não serve (título longo, bloco que não existe...).
  NEW_ASK_TITLE: ['NEW_ASK_PLACE', 'NEW_ASK_DESCRIPTION', 'NEW_ASK_PHOTO', 'NEW_ASK_TITLE'],
  NEW_ASK_PLACE: ['NEW_ASK_DESCRIPTION', 'NEW_ASK_PLACE'],
  NEW_ASK_DESCRIPTION: ['NEW_ASK_PHOTO', 'NEW_ASK_DESCRIPTION'],
  NEW_ASK_PHOTO: ['MENU', 'NEW_ASK_PHOTO'],
  // 3.3: "Minhas pautas". Com uma pauta só, o menu vai direto aos caminhos. Os caminhos ficam no
  // mesmo passo depois de abrir um (o outro continua disponível) e voltam ao menu com os dois.
  OWNER_PICK_PAUTA: ['OWNER_PATHS', 'OWNER_PICK_PAUTA', 'MENU'],
  OWNER_PATHS: [
    'OWNER_PATHS',
    'MENU',
    'OWNER_ASK_PROTOCOL',
    'OWNER_SEND_RESPONSE',
    'PROPOSAL_ASK_TEXT',
  ],
  // Número e dia do protocolo (3.4). Cada passo repete a pergunta quando a resposta não serve.
  OWNER_ASK_PROTOCOL: ['OWNER_ASK_PROTOCOL_DATE', 'OWNER_ASK_PROTOCOL', 'OWNER_PATHS', 'MENU'],
  OWNER_ASK_PROTOCOL_DATE: ['OWNER_PATHS', 'OWNER_ASK_PROTOCOL_DATE', 'OWNER_ASK_PROTOCOL', 'MENU'],
  // 3.5: a proposta repete a pergunta quando a resposta não serve e, publicada, volta aos caminhos.
  PROPOSAL_ASK_TEXT: ['PROPOSAL_ASK_PEOPLE', 'PROPOSAL_ASK_TEXT', 'MENU'],
  PROPOSAL_ASK_PEOPLE: ['OWNER_PATHS', 'PROPOSAL_ASK_PEOPLE', 'MENU'],
  // 5.7: confirmado ou não, a conversa volta ao menu (ou é apagada, se a pessoa saiu).
  LEAVE_CONFIRM: ['MENU'],
  // PDF da resposta oficial (3.6): repete o pedido até chegar um PDF que sirva.
  OWNER_SEND_RESPONSE: ['OWNER_PATHS', 'OWNER_SEND_RESPONSE', 'MENU'],
  // 2.7: relato e foto são opcionais; cada passo repete a pergunta quando a resposta não serve.
  SUPPORT_ASK_REPORT: ['SUPPORT_ASK_PHOTO', 'SUPPORT_ASK_REPORT', 'MENU'],
  SUPPORT_ASK_PHOTO: ['SUPPORT_ASK_PHOTO', 'MENU'],
};

/** Qualquer passo pode ir para estes via comandos globais ('menu', 'cancelar', 'sair'). */
export const GLOBAL_TARGETS: readonly Step[] = ['GREETING', 'MENU', 'LEAVE_CONFIRM'];

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

# Mensagens modelo da Meta

SCRUM-193 · RNF04 · Parte 3.

Fora da janela de atendimento de 24h, o bot só escreve primeiro com uma mensagem modelo aprovada pela
Meta. São seis, todas da categoria **UTILITY** e em `pt_BR`. A fonte da verdade é
[`apps/backend/src/bot/whatsapp/modelos.ts`](../../apps/backend/src/bot/whatsapp/modelos.ts); este
documento só mostra os textos para revisão e registra o andamento da aprovação.

## Os textos

Todas levam o rodapé "Lumens · pautas estudantis da UFAL". "Ver a pauta" é um botão de link para
`<site>/p/{slug}`.

| Modelo                    | Para quem    | Texto                                                                                                                                                                                 | Botões                       |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `lumens_meta_batida`      | apoiadores   | A pauta "{{1}}", que você apoiou, chegou à meta de {{2}} apoios. Agora ela segue para os responsáveis na universidade, e você recebe aqui a resposta oficial quando ela chegar.       | Ver a pauta                  |
| `lumens_resposta_oficial` | apoiadores   | A pauta "{{1}}", que você apoiou, recebeu resposta oficial de {{2}}: {{3}} A resposta completa está na página da pauta.                                                               | Ver a pauta                  |
| `lumens_conferencia`      | apoiadores   | A pauta "{{1}}", que você apoiou, tinha uma promessa para {{2}}: {{3}}. Foi feito? Você pode responder até {{4}}, e a resposta de quem apoiou decide o resultado que aparece no site. | Sim · Em parte · Não         |
| `lumens_lembrete_prazo`   | responsáveis | Lembrete da pauta "{{1}}": o prazo da UFAL para responder à manifestação no Fala.BR vence em {{2}}. Avisamos aqui quando a resposta chegar.                                           | Ver a pauta                  |
| `lumens_owner_inativo`    | responsáveis | Você é responsável pela pauta "{{1}}" e não vemos atividade sua nela desde {{2}}. Quer continuar como responsável?                                                                    | Quero continuar · Quero sair |
| `lumens_pauta_recusada`   | responsáveis | A pauta "{{1}}", pela qual você é responsável, não foi publicada pela curadoria. Motivo: {{2}}. Se quiser, você pode mandar um novo relato por aqui.                                  | (nenhum)                     |

### Por que os textos são assim

- **Sem apelo nenhum.** Nada de "compartilhe" ou "ajude a divulgar". A Meta reclassifica como
  marketing qualquer modelo com intenção promocional, e marketing custa mais e pesa contra a
  qualidade do número (decisão da SCRUM-192).
- **Sempre sobre algo da pessoa.** "A pauta que você apoiou", "você é responsável". Utilitário
  precisa ser específico de quem recebe.
- **Nenhuma variável na ponta do texto.** A Meta recusa corpo que começa ou termina com variável.
- **Os botões da conferência são respostas que o bot já entende.** "Sim", "Em parte" e "Não" são
  formas aceitas por `interpretarResposta` (SCRUM-224), então tocar no botão e digitar caem no
  mesmo caminho.

### O que os testes conferem

`modelos.test.ts` cobre as regras que fazem a Meta recusar ou reclassificar uma submissão, para os
seis modelos e para o pedido que `paraSubmissao` monta:

- nome só com minúsculas, dígitos e sublinhado; categoria `UTILITY`; idioma `pt_BR`;
- variáveis numeradas em sequência, nenhuma colada na outra, nenhuma na ponta do corpo;
- um exemplo por variável, sem tabulação, quebra de linha nem quatro espaços seguidos;
- limites de tamanho do corpo (1024), do rodapé (60) e do texto dos botões (25);
- botões sem texto repetido e sem variável; respostas rápidas e links em blocos separados;
- link com uma variável só, no fim da URL, e exemplo já resolvido;
- nenhum apelo de campanha no corpo ("compartilhe", "divulgue", exclamação);
- os nomes que o domínio enfileira são os mesmos do catálogo.

`mensagem-modelo.test.ts` confere o outro lado: o envio leva exatamente os parâmetros que o modelo
aprovado espera.

## Como submeter

Submeter é uma ação externa na conta da Meta e **só acontece com autorização explícita de quem
responde por ela**. Até lá, vale o dry-run.

### Dry-run

Não precisa de credencial nenhuma e não fala com a Meta: só imprime os pedidos.

```bash
pnpm --filter @lumens/backend modelos --site https://<dominio-do-site>
```

### Checklist antes de enviar

- [x] **Domínio definitivo do site decidido.** Ele vai fixo no botão "Ver a pauta" de três modelos:
      trocar depois exige editar o modelo e esperar nova aprovação. Não submeta com o endereço de
      homologação se ele for mudar. Domínio: `https://lumens-ufal.vercel.app`
- [x] **Responsável pela submissão definido**: alguém com acesso de administrador ao app da Meta e
      à conta do WhatsApp Business. Responsável: `Sthefany`
- [x] **Credenciais no `.env` da raiz, na máquina de quem submete**: `META_TOKEN` (token com a
      permissão `whatsapp_business_management`) e `META_WABA_ID` (id da conta do WhatsApp Business,
      no WhatsApp Manager). Nenhuma das duas entra no repositório.
- [ ] **Cobrança resolvida por quem é dono do portfólio.** A Meta cobra mensagens utilitárias
      (veja a [SCRUM-191](../decisoes/SCRUM-191-verificacao-meta.md)). Criar o modelo não envia
      mensagem, mas os avisos só saem com isso resolvido.
- [x] **Dry-run conferido** com o domínio definitivo: os seis pedidos, textos iguais aos da tabela
      acima.
- [ ] **`pnpm --filter @lumens/backend test` verde** na versão que será submetida.

### Enviar

```bash
# envia os seis
pnpm --filter @lumens/backend modelos --site https://<dominio-do-site> --enviar

# envia um só
pnpm --filter @lumens/backend modelos --site https://<dominio-do-site> --so lumens_conferencia --enviar
```

Para cada modelo o comando imprime o que a Meta respondeu: `{"id":"...","status":"...","category":"..."}`.
**Copie a saída inteira** e registre na tabela de [andamento](#andamento): o `id`, a data, o
`status` e a `category` de cada linha.

Se `category` vier `MARKETING`, a Meta leu o texto como promocional: ajuste o texto e reabra a
SCRUM-192 antes de seguir.

### Acompanhar a aprovação

A revisão da Meta pode levar de minutos a um dia. Para ver a situação atual, sem alterar nada:

```bash
pnpm --filter @lumens/backend modelos --situacao
```

O comando lista `id`, situação (`PENDING`, `APPROVED`, `REJECTED`...), categoria e idioma de cada
um dos seis modelos, ou avisa que o modelo não está na Meta. Atualize a tabela a cada mudança. Se
um modelo for recusado, o motivo aparece no WhatsApp Manager (Modelos de mensagem → o modelo):
anote o motivo, corrija `modelos.ts` e submeta de novo.

Para mudar um texto depois de aprovado: altere `modelos.ts`, submeta de novo e só então faça deploy
de quem envia. A Meta recusa envio cujo número de variáveis não bate com o modelo aprovado.

## Andamento

**Primeira submissão: 2026-11-10, às 18:32 (horário de Brasília), por Sthefany**, com o domínio
`https://lumens-ufal.vercel.app`. Antes do envio, `--situacao` confirmou que nenhum dos seis existia
na conta. A Meta aceitou os seis pedidos, todos em `PENDING` e com categoria `UTILITY`; o
`--situacao` rodado logo depois (18:33) devolveu os mesmos ids, situação e categoria, em `pt_BR`.

**A conta usada é a de teste** ("Test Messaging Account", do número de teste da Meta): a conta do
Facebook da responsável é recente e ainda não libera um número de produção. Os modelos ficam presos à
conta onde foram criados, então, quando houver número e conta de produção, os seis precisam ser
submetidos de novo lá e esperar nova aprovação.

Atualize a tabela a cada submissão e a cada mudança de situação. Preencha só com o que a Meta
respondeu.

| Modelo                    | Id na Meta       | Submetido em | Situação  | Categoria devolvida | Atualizado em |
| ------------------------- | ---------------- | ------------ | --------- | ------------------- | ------------- |
| `lumens_meta_batida`      | 1124361657017155 | 2026-11-10   | `PENDING` | `UTILITY`           | 2026-11-10    |
| `lumens_resposta_oficial` | 1954383762194455 | 2026-11-10   | `PENDING` | `UTILITY`           | 2026-11-10    |
| `lumens_conferencia`      | 1685902049990843 | 2026-11-10   | `PENDING` | `UTILITY`           | 2026-11-10    |
| `lumens_lembrete_prazo`   | 1112877021560025 | 2026-11-10   | `PENDING` | `UTILITY`           | 2026-11-10    |
| `lumens_owner_inativo`    | 1438995534448675 | 2026-11-10   | `PENDING` | `UTILITY`           | 2026-11-10    |
| `lumens_pauta_recusada`   | 1878214926703375 | 2026-11-10   | `PENDING` | `UTILITY`           | 2026-11-10    |

## O que este documento não resolve

- **Quando sai o lembrete de prazo** e o que acontece com o owner que responde "Quero sair" ou não
  responde: são regras das histórias do agendador. Os textos não prometem nada além de perguntar.

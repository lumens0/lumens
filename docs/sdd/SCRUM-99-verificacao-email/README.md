# SCRUM-99 — [2.4] Verificação pelo e-mail institucional

|            |                                                               |
| ---------- | ------------------------------------------------------------- |
| **Ticket** | [SCRUM-99](https://ic-team-pds.atlassian.net/browse/SCRUM-99) |
| **Dev**    | @eumarcosmendonca                                             |
| **Ref**    | RF-B04, RF-B05, RN01 · história 2.4                           |

A história é entregue por subtask, uma branch e uma PR para cada.

| Subtask   | O quê                                                     | Branch                              | PR / situação |
| --------- | --------------------------------------------------------- | ----------------------------------- | ------------- |
| SCRUM-134 | Pedir o e-mail e aceitar só `@ufal.br` e `@*.ufal.br`     | `feat/SCRUM-134-email-ufal`         | #97           |
| SCRUM-135 | Código de 6 dígitos (hash SHA-256, 10 min) por Nodemailer | `feat/SCRUM-135-codigo-email`       | #100 (na #97) |
| SCRUM-136 | Conferir o código; máx. 5 tentativas; reenvio após 60 s   | `feat/SCRUM-136-tentativas-reenvio` | #102 (na #97) |
| SCRUM-137 | Vincular telefone ↔ e-mail (RN01); e-mail já usado        | `feat/SCRUM-137-vincular-email`     | #107          |
| SCRUM-138 | Curso numa lista; marcar verificado; retomar o pedido     | `feat/SCRUM-138-curso-verificado`   | esta PR       |

Com a SCRUM-138, a história fica completa no bot. O critério "não cai no spam" foi testado numa
conta real da UFAL na SCRUM-139: o e-mail sai pelo SMTP do Google da conta `@ic.ufal.br`, porque
pela Brevo o Gmail mostra alerta de falsificação (detalhes em [TESTS.md](TESTS.md)).

## Documentos

| Arquivo                | O que contém                               |
| ---------------------- | ------------------------------------------ |
| [`SPEC.md`](SPEC.md)   | Comportamento de cada subtask já entregue. |
| [`PLAN.md`](PLAN.md)   | Onde fica cada parte e as decisões.        |
| [`TESTS.md`](TESTS.md) | O que os testes exercitam e as lacunas.    |

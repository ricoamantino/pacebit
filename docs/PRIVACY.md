# Política de Privacidade do Pacebit

**Última atualização:** 31 de agosto de 2026

Esta política descreve como a extensão Pacebit acessa, usa, armazena e compartilha dados. O contato
responsável por dúvidas de privacidade é [ricoamantino@gmail.com](mailto:ricoamantino@gmail.com).

## Resumo

O Pacebit lê tarefas do Google Tasks para permitir que o usuário escolha uma tarefa e registre o
tempo dedicado a ela. A sessão ativa e o histórico ficam somente no armazenamento local da
extensão, associado ao perfil atual do Chrome. O Pacebit não possui servidor próprio e não vende,
aluga ou utiliza dados para publicidade, telemetria ou treinamento de inteligência artificial.

## Dados acessados do Google Tasks

Depois da autorização do usuário, o Pacebit pode acessar:

- identificadores e títulos das listas de tarefas;
- identificadores e títulos das tarefas;
- status, data agendada, posição e relação de hierarquia das tarefas;
- indicadores necessários para excluir tarefas concluídas, removidas, ocultas ou atribuídas;
- resultado da conclusão de uma tarefa solicitada explicitamente pelo usuário.

Esses dados são usados para carregar, identificar, priorizar e apresentar as tarefas elegíveis. As
respostas completas da Google Tasks API não são persistidas.

## Dados armazenados localmente

O Pacebit grava no `storage.local` do Chrome somente:

- a sessão ativa, com identificador, snapshots mínimos da tarefa e da lista, timestamps e períodos
  executados;
- o histórico de sessões concluídas, com os mesmos snapshots mínimos, início, fim, períodos e
  duração.

Os títulos são preservados no histórico para que o registro continue compreensível caso a tarefa
seja alterada ou removida do Google Tasks. Esses dados não são sincronizados entre dispositivos ou
perfis.

## Autorização Google

O Pacebit usa `chrome.identity` e o scope
`https://www.googleapis.com/auth/tasks`. O Chrome gerencia o token OAuth. O Pacebit não acessa a
senha da conta, não mantém cache próprio do token e não grava token, client secret ou API key.

O scope permite operações mais amplas do que o produto utiliza porque a API não oferece uma
permissão menor para concluir tarefas. O Pacebit limita voluntariamente seu uso a:

1. ler listas e tarefas elegíveis;
2. marcar uma tarefa como concluída somente depois de uma ação explícita do usuário.

O Pacebit não cria tarefas, não edita títulos ou notas, não altera datas, não move, não reorganiza
e não exclui tarefas.

## Compartilhamento e transmissão

As chamadas necessárias são enviadas diretamente da extensão para a Google Tasks API por HTTPS.
Dados de tarefas e identificadores necessários à operação são transmitidos somente ao Google. O
Pacebit não envia tarefas, listas, sessões ou histórico para servidores do desenvolvedor ou outros
terceiros.

O tratamento realizado pelo Google permanece sujeito aos termos e políticas da própria empresa.

## Retenção e exclusão

Tarefas e listas permanecem em memória somente enquanto o popup está em uso. Sessão ativa e
histórico permanecem no perfil do Chrome até que o usuário:

- remova a extensão; ou
- limpe os dados de armazenamento da extensão pelo Chrome.

O MVP não oferece exclusão individual de registros históricos. A extensão não possui uma cópia em
servidor que precise de solicitação separada de exclusão.

## Segurança

O Pacebit usa Manifest V3, solicita apenas `identity` e `storage`, limita o acesso de rede a
`https://tasks.googleapis.com/*`, não executa código remoto e não usa content scripts. O projeto é
aberto para inspeção pública. Nenhum método de armazenamento ou transmissão elimina todos os
riscos, mas o produto reduz sua superfície mantendo dados localmente e evitando servidores
próprios.

## Venda, publicidade e usos proibidos

O Pacebit não:

- vende ou aluga dados;
- compartilha dados para publicidade;
- cria perfis de publicidade ou crédito;
- usa analytics ou telemetria;
- usa dados para treinar modelos de inteligência artificial;
- combina dados do Google com outras fontes para finalidade não informada.

## Limited Use

O uso de informações recebidas das APIs do Google pelo Pacebit seguirá a
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
incluindo os requisitos de Limited Use.

> Pacebit's use and transfer of information received from Google APIs will adhere to the Google
> API Services User Data Policy, including the Limited Use requirements.

## Alterações desta política

Esta política deverá ser atualizada antes de qualquer mudança material na forma como o Pacebit
acessa, usa, armazena ou compartilha dados. A data no início do documento indicará a revisão mais
recente.

## Contato

Para dúvidas sobre esta política ou o tratamento local dos dados, escreva para
[ricoamantino@gmail.com](mailto:ricoamantino@gmail.com).

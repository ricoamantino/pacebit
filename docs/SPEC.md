# Plano de execução

Checklist executável do MVP. Uma tarefa só recebe `[x]` depois de implementada e verificada conforme `AGENTS.md`.

- Escopo e decisões: [`SCOPE.md`](SCOPE.md)
- Regras de contribuição: [`../AGENTS.md`](../AGENTS.md)

## Legenda

- `[x]` concluído e revisado.
- `[ ]` não iniciado, em andamento ou ainda não verificado.
- As etapas seguem a ordem recomendada; uma tarefa pode depender das anteriores.
- Validações datadas devem registrar somente comandos e verificações realmente executados.
- O MVP estará tecnicamente concluído quando estiver pronto para submissão. Aprovações externas do Google e da Chrome Web Store não fazem parte deste gate.

## 1. Fundação do repositório

### 1.1 Repositório e scaffold

- [x] Inicializar o repositório Git sem alterar arquivos externos ao Pacebit.
- [x] Criar o projeto WXT com React, TypeScript e pnpm.
- [x] Confirmar que o build gera uma extensão Chrome Manifest V3 válida.
- [x] Ativar as opções estritas recomendadas do TypeScript.
- [x] Criar `.gitignore` para WXT, Node, artefatos, relatórios de teste e arquivos locais.
- [x] Configurar metadados iniciais do Pacebit no manifesto.
- [x] Criar o popup como única superfície principal do MVP.
- [x] Confirmar que não existem content scripts nem código de manipulação do Google Tasks.
- [x] Adicionar somente assets próprios necessários à extensão e ao pacote de submissão.

Validação de 2026-08-28: instalação com lockfile imutável, `wxt prepare`, TypeScript e build
Chrome MV3 aprovados. Manifesto e fontes confirmaram popup único, opções estritas, metadados,
ícones próprios e ausência de background e content scripts. Smoke manual no Chrome confirmou a
extensão 0.1.0 instalada com o ID `jkpogflkipedlninnnplenlajoofkkfp`, ícone do Pacebit e popup
renderizado com título e texto esperados, sem erro reportado.

### 1.2 Manifesto e acessos privilegiados

- [x] Configurar em `wxt.config.ts` somente as permissões `identity` e `storage`.
- [x] Configurar somente a host permission `https://tasks.googleapis.com/*`.
- [x] Configurar somente o scope OAuth `https://www.googleapis.com/auth/tasks`.
- [x] Configurar o client ID OAuth sem incorporar client secret.
- [x] Confirmar que o manifesto não solicita `tabs`, `activeTab`, `scripting`, `unlimitedStorage`, modo anônimo, alarmes ou acessos preventivos.
- [x] Documentar como configurar valores próprios de desenvolvimento sem versionar segredos ou credenciais locais desnecessárias.

Validação de 2026-08-28: `wxt prepare` e TypeScript aprovados sem credencial; build, ZIP
e desenvolvimento recusaram client ID ausente ou inválido. Build MV3 com identificador sintético
confirmou exatamente `identity`, `storage`, o host e o scope aprovados, modo anônimo desabilitado
e ausência dos acessos proibidos. `.env.local`, `.env.example` e o repositório foram auditados.
A credencial real e a chave pública foram incorporadas e validadas posteriormente na fase 4.1.

### 1.3 Scripts e qualidade

- [x] Configurar Biome para lint e formatação.
- [x] Configurar Vitest com ambiente adequado aos testes de domínio e React.
- [x] Configurar React Testing Library.
- [x] Configurar Playwright para executar a extensão carregada no Chromium.
- [x] Adicionar os scripts `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `test:watch`, `test:e2e` e `check`.
- [x] Garantir que `pnpm check` execute typecheck, lint e testes unitários.
- [x] Fixar as dependências em lockfile e validar instalação com lockfile imutável.
- [x] Executar e registrar o primeiro `pnpm check` e o primeiro build limpo.

Validação de 2026-08-29: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test:e2e` e
`pnpm build` concluídos. Um teste do popup passou no Vitest e um smoke passou no Chromium com a
extensão carregada pelo ID estável, sem erro de console ou página. O manifesto de produção manteve
os acessos aprovados e não incorporou a configuração sintética de teste. `pnpm audit --prod` não
encontrou vulnerabilidades; a auditoria completa permanece com dois avisos conhecidos e sem versão
corrigida em `image-size`, dependência exclusiva da ferramenta de desenvolvimento `web-ext`.

### 1.4 Integração contínua

- [x] Criar workflow do GitHub Actions com pnpm e cache apropriado.
- [x] Instalar dependências com lockfile imutável no CI.
- [x] Executar `pnpm check` no CI.
- [x] Executar `pnpm build` no CI.
- [x] Gerar ou preservar o pacote instalável como artefato do workflow.
- [x] Confirmar que falhas de validação impedem a produção do artefato final.

Validação de 2026-08-29: execução do GitHub Actions para o commit `4c9abff` aprovou instalação com
lockfile imutável, `pnpm check` com um teste, build, ZIP e upload. O artefato remoto foi baixado e
confirmou somente os dez arquivos de runtime esperados; o manifesto MV3 preservou exatamente os
acessos aprovados. O job único e sequencial não usa `always()`, e a execução anterior com falha não
produziu artefato, confirmando que uma etapa malsucedida impede o pacote final.

## 2. Domínio do timer

### 2.1 Modelo persistente

- [x] Definir tipos explícitos para sessão em execução, sessão pausada, período de execução e sessão concluída.
- [x] Representar ausência de sessão sem criar um quarto estado persistente artificial.
- [x] Modelar identificador único da sessão, IDs e snapshots mínimos de tarefa e lista.
- [x] Modelar início, fim, períodos efetivamente executados e duração total sem ambiguidade de fuso horário.
- [x] Garantir que o modelo permita reconstruir a duração sem contador em memória.
- [x] Manter os tipos de domínio independentes de React, Chrome e Google Tasks.

Validação de 2026-08-29: `pnpm check`, `pnpm build` e `git diff --check` concluídos. TypeScript
confirmou a união discriminada dos estados ativos, períodos fechados não vazios para sessões
pausadas e concluídas e a representação temporal em milissegundos Unix. Inspeção do módulo
confirmou ausência de estado ocioso, contador em memória e dependências de React, Chrome, WXT ou
Google Tasks.

### 2.2 Transições

- [x] Implementar a transição de iniciar somente quando não existir sessão ativa.
- [x] Implementar pausar acumulando exatamente o período em execução atual.
- [x] Implementar retomar criando exatamente um novo período em execução.
- [x] Implementar finalizar a partir dos estados em execução e pausado.
- [x] Implementar cancelar a partir dos estados em execução e pausado sem criar histórico.
- [x] Rejeitar transições inválidas com resultado explícito e sem corromper o estado.
- [x] Tornar ações repetidas e cliques rápidos idempotentes onde o comando representar a mesma intenção.
- [x] Preservar duração real, inclusive quando a sessão for muito curta.

Validação de 2026-08-29: `pnpm check`, `pnpm build` e `git diff --check` concluídos, com 17 testes
das transições e 18 testes totais aprovados. Os cenários cobriram início, pausa, retomada,
finalização, cancelamento, repetição, rejeições temporais, múltiplas pausas, duração zero e
imutabilidade das entradas. Inspeção confirmou funções determinísticas sem relógio, persistência ou
dependências de React, Chrome, WXT e Google Tasks.

### 2.3 Cálculos temporais

- [x] Calcular duração somente pela soma das interseções dos períodos executados.
- [x] Excluir integralmente os intervalos pausados.
- [x] Calcular a parcela de um período que pertence a um dia civil local.
- [x] Incluir no cálculo a parcela corrente de uma sessão em execução sem persistir atualizações por segundo.
- [x] Recalcular corretamente após passagem da meia-noite.
- [x] Garantir que mudança de fuso não altere durações registradas e apenas redefina apresentação e pertencimento ao dia local.
- [x] Tratar datas agendadas do Google Tasks como datas civis, sem interpretar horário do campo `due`.

Validação de 2026-08-29: `pnpm check`, `pnpm build` e `git diff --check` concluídos, com 18 novos
testes temporais e 36 testes totais aprovados. Foram verificados duração e pausas, histórico e
sessões ativas, intervalos semiabertos na meia-noite, dias locais de 23 e 25 horas, recálculo após
mudança de dia e fuso e datas civis do Google Tasks sem conversão do horário de `due`. Inspeção
confirmou ausência de relógio interno, contador, cache temporal ou nova dependência.

### 2.4 Testes do domínio

- [x] Testar todas as transições válidas da tabela do escopo.
- [x] Testar transições inválidas, ações repetidas e cliques rápidos.
- [x] Testar duração com nenhum, um e múltiplos intervalos de pausa.
- [x] Testar finalização em execução e em pausa.
- [x] Testar cancelamento com e sem tempo registrado.
- [x] Testar sessão de duração muito curta.
- [x] Testar períodos que começam ou terminam nos limites da meia-noite.
- [x] Testar total diário com sessão ativa, pausada e concluída.
- [x] Testar mudança de dia e mudança de fuso horário com relógio controlado.

## 3. Persistência e concorrência

### 3.1 WXT Storage

- [x] Definir item `local:` conhecido para a sessão ativa com `storage.defineItem`.
- [x] Definir item `local:` conhecido para o histórico com `storage.defineItem`.
- [x] Não usar `session:`, `sync:` nem wrapper genérico sobre WXT Storage.
- [x] Fazer leitura ausente produzir estado inicial válido.
- [x] Detectar dados persistidos inválidos ou incompatíveis sem tratá-los silenciosamente como válidos.
- [x] Usar versão e migração nativas somente quando uma mudança real de schema exigir.
- [x] Não persistir preferências, tokens nem cópias completas das respostas do Google Tasks.

Validação de 2026-08-29: `pnpm check`, `pnpm build` e `git diff --check` concluídos, com 22 novos
testes de persistência e 58 testes totais aprovados. O fake browser confirmou recuperação dos
estados ausente, em execução e pausado, histórico vazio e preenchido, fallbacks sem escrita física
e uso exclusivo de `storage.local`. Dados incompatíveis, períodos inválidos, duração inconsistente
e IDs históricos duplicados foram rejeitados explicitamente; campos desconhecidos foram removidos
durante a reconstrução. Inspeção confirmou itens privados sem versão, migração ou dados alheios às
sessões.

### 3.2 Operações persistentes

- [x] Persistir cada transição confirmada antes de apresentá-la como concluída.
- [x] Salvar exatamente um registro histórico antes de remover a sessão ativa durante a finalização.
- [x] Preservar a sessão ativa se a escrita do histórico ou a remoção subsequente falhar.
- [x] Repetir uma finalização interrompida sem duplicar o histórico.
- [x] Tratar falha de escrita e quota com mensagem recuperável e sem falso sucesso.
- [x] Recuperar sessão e histórico após remontagem do React e reabertura do popup.
- [x] Recuperar sessão e histórico após reinício do Chrome, atualização ou recarga da extensão e recriação de contextos.
- [x] Manter pausa, retomada, finalização e cancelamento disponíveis sem conexão com o Google.

Validação de 2026-08-29: `pnpm check`, `pnpm build` e `git diff --check` concluídos, com 16 novos
testes de operações persistentes e 74 testes totais aprovados. Foram confirmadas as cinco
transições locais, ausência de escrita para rejeições e intenções já satisfeitas, resposta somente
depois da escrita, histórico salvo antes da remoção e preservação do estado em cada falha. Retry de
finalização reutilizou o primeiro registro sem duplicar nem estender a duração; colisões
incompatíveis foram preservadas e rejeitadas. Falhas de leitura, escrita e quota produziram apenas
motivos sanitizados. A recriação do módulo recuperou sessão e histórico de `storage.local`, e o
fluxo permaneceu independente de acesso remoto. Os smokes reais de ciclo de vida do Chrome
continuam reservados à seção 8.2.

### 3.3 Coordenação entre instâncias

- [x] Fazer instâncias abertas observarem e convergirem para o estado persistido mais recente.
- [x] Associar cada comando à versão ou identidade do estado sobre o qual foi iniciado.
- [x] Rejeitar uma transição baseada em estado obsoleto e recarregar o estado atual.
- [x] Impedir que duas instâncias iniciem sessões diferentes simultaneamente.
- [x] Impedir que pausas ou retomadas concorrentes dupliquem ou percam períodos confirmados.
- [x] Impedir que finalizações concorrentes produzam dois registros históricos.
- [x] Proteger uma finalização pendente de limpeza contra pausa, retomada ou cancelamento posterior.
- [x] Rejeitar reutilização incompatível de ID ativo ou já presente no histórico.
- [x] Avaliar primeiro coordenação por persistência e APIs nativas; adicionar mensageria ou escritor único apenas se necessário para preservar as invariantes.
- [x] Manter qualquer background introduzido reconstruível pela persistência e limitado à responsabilidade concreta que o exigir.

Validação de 2026-08-29: `pnpm check`, `pnpm test:e2e`, `pnpm build`, `pnpm audit --prod` e
`git diff --check` concluídos, com 17 novos testes unitários, 91 testes unitários totais e dois
smokes aprovados no Chromium. Duas páginas reais da extensão confirmaram que Web Locks são
compartilhados e exclusivos nessa origem, sem nova permissão ou background. Testes controlados do
lock `pacebit:timer-storage` confirmaram um único vencedor em início, pausa, retomada, finalização e
cancelamento concorrentes, conflitos com o estado atual, observadores convergentes sem estado
intermediário e recuperação de finalização pendente. Colisões de ID e dados incompatíveis
permaneceram preservados e bloqueados. O manifesto de produção manteve
somente `identity`, `storage` e o host aprovado, e a auditoria de produção não encontrou
vulnerabilidades.

### 3.4 Testes de persistência e concorrência

- [x] Testar recuperação de sessão em execução, pausada e ausente.
- [x] Testar recuperação de histórico vazio e preenchido.
- [x] Testar dados ausentes, inválidos e incompatíveis.
- [x] Testar falha em cada escrita relevante da finalização.
- [x] Testar quota excedida sem perda silenciosa de estado.
- [x] Testar início, pausa, retomada, finalização e cancelamento a partir de duas instâncias.
- [x] Testar que exatamente um comando concorrente vence e o outro recebe conflito recuperável.
- [x] Testar que nenhuma falha remota do Google altera dados locais válidos.

## 4. Google Cloud, OAuth e Tasks API

### 4.1 Configuração Google

- [x] Criar projeto Google Cloud próprio do Pacebit para o ambiente de distribuição.
- [x] Habilitar a Google Tasks API no projeto.
- [x] Definir um ID estável para a extensão distribuível.
- [x] Criar credencial OAuth do tipo extensão Chrome vinculada ao ID estável.
- [x] Manter configurações de desenvolvimento e distribuição separadas quando necessário.
- [x] Configurar marca, audiência, tela de consentimento e scope usado pelo produto.
- [x] Confirmar que nenhum client secret, token ou credencial privada entra no repositório ou bundle.

Validação de 2026-08-28: projeto Google Cloud e Google Tasks API habilitada confirmados pelo
fluxo do console. A chave pública do item deriva o ID estável
`jkpogflkipedlninnnplenlajoofkkfp`, que corresponde à credencial OAuth Chrome criada. O client ID
real permanece no `.env.local` ignorado; `wxt prepare`, TypeScript e build MV3 foram aprovados, e
repositório e bundle não contêm client secret, token, chave privada ou API key.

Validação de 2026-08-29: a matriz de ambientes foi comprovada com client ID sintético e não
funcional no `.env.test`, client ID real no `.env.local` ignorado e variável pública do GitHub
Actions para o build distribuível. O `.env.example` documenta a separação sem incorporar o valor
real. No Google Auth Platform, a marca `Pacebit` usa o ícone próprio, e-mails de suporte e contato
do proprietário e nenhuma URL ou domínio provisório. A audiência foi confirmada como externa em
modo de teste, com uma conta de teste cadastrada. O acesso contém exclusivamente
`https://www.googleapis.com/auth/tasks`. O cliente é do tipo extensão Chrome e vincula o client ID
real ao ID estável `jkpogflkipedlninnnplenlajoofkkfp`. Homepage, política de privacidade, publicação
e verificação continuam reservadas à seção 9.

### 4.2 Autenticação

- [x] Encapsular `chrome.identity` fora dos componentes React.
- [x] Tentar obter token de forma não interativa depois de uma autorização prévia.
- [x] Iniciar o fluxo interativo somente após ação explícita e contextualizada do usuário.
- [x] Usar a conta Google associada ao perfil atual do Chrome sem criar seletor próprio.
- [x] Remover token inválido do cache da Identity API antes de solicitar renovação.
- [x] Não armazenar tokens em WXT Storage nem manter cache paralelo.
- [x] Tratar token ausente, autorização recusada, token expirado ou revogado e renovação necessária.
- [x] Expor à interface estados de autenticação pequenos e sanitizados, sem detalhes internos.

Validação de 2026-08-29: adaptador isolado de `chrome.identity` aprovado em 15 testes novos, dentro
de 106 testes unitários totais. Foram comprovados token silencioso, chamada interativa restrita à
função explícita, scopes concedidos, remoção e renovação ordenadas, respostas ausentes, recusas e
falhas sanitizadas, API indisponível e ausência de Storage, logs ou rede real. `pnpm check`,
`pnpm test:e2e` (2 testes), `pnpm build`, `pnpm audit --prod` (sem vulnerabilidades conhecidas) e
`git diff --check` passaram. O manifesto MV3 de produção exige Chrome 106, mantém o ID e client ID
estáveis e contém somente `identity`, `storage`, o host da Tasks API e o scope aprovado, sem
background ou content script. O gesto real do usuário será comprovado quando o popup integrar o
adaptador.

### 4.3 Cliente REST

- [x] Criar cliente REST direto para `https://tasks.googleapis.com/tasks/v1` usando o token OAuth.
- [x] Não adicionar API key, SDK remoto, cliente JavaScript remoto ou abstração para múltiplos provedores.
- [x] Centralizar operações concretas de listas, tarefas e conclusão fora do React.
- [x] Solicitar somente campos consumidos pelo produto e incluir `nextPageToken` nas respostas parciais.
- [x] Tratar respostas sem corpo esperado, payload inválido, HTTP não exitoso, rede, autorização e limite.
- [x] Sanitizar erros antes de entregá-los à interface ou aos logs.
- [x] Permitir cancelamento ou descarte seguro de resultados obsoletos do carregamento.

Validação de 2026-08-29: cliente REST direto aprovado em 33 testes novos, dentro de 139 testes
unitários totais. Foram comprovadas operações de uma página para listas e tarefas, filtros e campos
parciais exatos, tokens de paginação, codificação de IDs, reconstrução de respostas, página vazia,
payload inválido, mapeamento sanitizado de HTTP e rede e cancelamento por `AbortSignal`. O `PATCH`
de conclusão envia somente `{ "status": "completed" }` e solicita `id`, `status` e `completed` na
resposta, sem integrar ainda o fluxo local ou o popup. `pnpm check`, `pnpm test:e2e` (2 testes),
`pnpm build`, `pnpm audit --prod` (sem vulnerabilidades conhecidas) e `git diff --check` passaram.
O manifesto permaneceu sem novos acessos, background ou content script, e os testes não usaram
conta Google, Storage ou chamada remota real.

### 4.4 Listas e tarefas

- [x] Paginar `tasklists.list` até consumir todos os `nextPageToken`.
- [x] Paginar `tasks.list` de cada lista até consumir todos os `nextPageToken`.
- [x] Enviar explicitamente `showCompleted=false`, `showDeleted=false`, `showHidden=false` e `showAssigned=false`.
- [x] Ler os campos necessários para IDs, títulos, lista, data agendada, hierarquia, posição e estado.
- [x] Incluir subtarefas próprias como tarefas elegíveis independentes.
- [x] Excluir tarefas concluídas, excluídas, ocultas e atribuídas por Docs ou Chat Spaces.
- [x] Não aplicar limite arbitrário nem declarar resultado parcial como completo.
- [x] Representar falha por lista e permitir nova tentativa sem apagar resultados locais válidos.

Validação de 2026-08-29: carregador sequencial aprovado em 17 testes novos, dentro de 156 testes
unitários totais. Todas as páginas de listas e tarefas foram consumidas na ordem dos tokens, sem
limite arbitrário. Subtarefas permaneceram elegíveis, enquanto tarefas concluídas, excluídas,
ocultas e atribuídas foram removidas defensivamente. Falhas por lista preservaram páginas válidas
e permitiram continuar ou repetir somente a lista afetada; autorização, cancelamento, rede e limite
interromperam novas requisições mantendo o catálogo parcial e as listas pendentes. Tokens repetidos
e datas agendadas inválidas foram rejeitados sem loop. `pnpm check`, `pnpm test:e2e` (2 testes),
`pnpm build`, `pnpm audit --prod` (sem vulnerabilidades conhecidas) e `git diff --check` passaram.
O manifesto MV3 permaneceu somente com `identity`, `storage` e o host aprovado, sem background ou
content script.

### 4.5 Testes da integração controlada

- [x] Testar autenticação sem interação quando o token estiver disponível.
- [x] Testar autorização interativa somente depois da ação do usuário.
- [x] Testar token inválido, remoção do cache e nova tentativa.
- [x] Testar paginação de listas e tarefas em uma e várias páginas.
- [x] Testar presença dos quatro filtros explícitos e dos campos parciais necessários.
- [x] Testar lista vazia, subtarefa, tarefa atribuída, resposta inválida, falhas HTTP e rede.
- [x] Testar carregamento parcial sem apresentá-lo como completo.
- [x] Manter os testes comuns independentes de uma conta Google e de chamadas reais.

## 5. Popup e apresentação das tarefas

### 5.1 Estrutura e estados

- [x] Criar a composição principal do popup em português do Brasil.
- [x] Exibir estado desconectado com explicação e ação contextual para conectar.
- [x] Exibir estados distintos de conectando, carregando tarefas, vazio real, resultado parcial, offline e erro recuperável.
- [x] Manter sessão ativa, total do dia e histórico acessíveis quando o Google estiver indisponível.
- [x] Oferecer nova tentativa para autenticação e carregamento sem recarregar ou apagar dados locais.
- [x] Não expor tokens, URLs internas, payloads REST, stack traces ou detalhes de implementação.

Validação de 2026-08-29: popup funcional aprovado em 16 testes de interface, dentro de 171 testes
unitários totais. Foram comprovados autorização silenciosa, gesto explícito antes da autorização
interativa, conexão, carregamento, vazio real, resultado parcial, indisponibilidade, erro e retry
sem apagar tarefas já carregadas. Um `401` removeu e renovou o token uma única vez, operações
obsoletas foram canceladas e a remontagem em `StrictMode` limpou observadores e intervalos. Sessão
ativa, total diário e resumo do histórico permaneceram visíveis diante de falha Google ou Storage,
com atualização do relógio apenas na apresentação e mensagens sanitizadas. `pnpm check`,
`pnpm test:e2e` (2 testes), `pnpm build`, `pnpm audit --prod` (sem vulnerabilidades conhecidas) e
`git diff --check` passaram. Inspeção visual no Chromium confirmou a composição compacta, e o
manifesto permaneceu sem novos acessos, background ou content script.

### 5.2 Priorização e carregamento

- [x] Apresentar primeiro a sessão ativa, quando existir.
- [x] Ordenar tarefas vencidas da data mais antiga para a mais recente.
- [x] Apresentar depois tarefas de hoje, sem data e futuras da data mais próxima para a mais distante.
- [x] Dentro do mesmo grupo e data, desempatar pela ordem estável das listas retornadas, pela `position` da tarefa e finalmente pelo ID.
- [x] Preservar a ordem já apresentada quando novas páginas não alterarem a prioridade relativa dos itens existentes.
- [x] Exibir o nome da lista junto de cada tarefa.
- [x] Tratar subtarefas como itens independentes sem oferecer edição de hierarquia.
- [x] Indicar carregamento progressivo enquanto ainda houver páginas e nunca rotular resultado parcial como completo.

Validação de 2026-08-29: priorização e progresso aprovados em 12 testes novos, dentro de 183
testes unitários totais. O domínio puro comprovou os quatro grupos, datas, ordem original das
listas, `position`, ID, subtarefas e estabilidade diante de novas páginas. O carregador emitiu
snapshots imutáveis após páginas e mudanças de lista, preservou conteúdo válido em falhas e
cancelamentos e continuou sequencial. O popup apresentou tarefas durante a carga inicial,
preservou o catálogo anterior em atualizações, descartou progresso obsoleto, recalculou os grupos
na mudança do dia e manteve a sessão antes das tarefas. `pnpm check`, `pnpm test:e2e` (dois
smokes), `pnpm build`, `pnpm audit --prod` e `git diff --check` passaram. A inspeção visual no
Chromium confirmou a composição compacta e sem erros; o manifesto permaneceu sem novos acessos,
background ou content script.

### 5.3 Acessibilidade e comportamento

- [x] Usar regiões, títulos, listas, botões e formulários semanticamente adequados.
- [x] Associar rótulos acessíveis a todos os controles.
- [x] Garantir foco visível e ordem de teclado previsível.
- [x] Não depender somente de cor para comunicar prioridade, estado ou falha.
- [x] Desabilitar ações impossíveis com explicação curta.
- [x] Manter títulos de tarefa e lista como texto não confiável, sem injeção de HTML.
- [x] Garantir comportamento seguro sob remontagem do React e efeitos repetidos em desenvolvimento.

Validação de 2026-08-29: semântica e comportamento acessível aprovados com um teste novo e testes
existentes ampliados, dentro de 184 testes unitários totais. Regiões e cartões foram nomeados pelos
próprios títulos, tarefas permaneceram em listas semânticas e os controles receberam nomes,
descrições e estados ocupados observáveis. A interface continuou comunicando prioridade e falha
por texto, sem depender de cor, e não introduziu formulário onde não existe entrada de dados. O
smoke Playwright navegou por `Tab` até o único controle disponível e confirmou foco visível de
3 px, nome e descrição acessíveis e ordem estrutural no Chromium. `pnpm check`,
`pnpm test:e2e` (dois smokes), `pnpm build`, `pnpm audit --prod` e `git diff --check` passaram.
O manifesto permaneceu sem novos acessos, background ou content script.

### 5.4 Testes do popup

- [x] Testar os estados desconectado, conectando, carregando, vazio, parcial, offline e erro recuperável com Testing Library.
- [x] Testar a prioridade completa e o desempate estável das tarefas.
- [x] Testar listas com títulos iguais, subtarefas e carregamento de novas páginas.
- [x] Testar que resultado parcial nunca é comunicado como completo.
- [x] Testar foco, nomes acessíveis, teclado e estados desabilitados dos controles críticos.
- [x] Testar que dados remotos são renderizados como texto.

## 6. Execução, histórico e total diário

### 6.1 Seleção e sessão ativa

- [x] Permitir seleção transitória somente de tarefa carregada pela API.
- [x] Iniciar a sessão persistindo imediatamente IDs e snapshots mínimos de tarefa e lista.
- [x] Impedir uma segunda sessão ativa e explicar como encerrar ou cancelar a atual.
- [x] Apresentar tarefa, lista, estado, duração atual e ação válida seguinte.
- [x] Atualizar a duração visual por relógio de interface sem transformar o contador em fonte de verdade.
- [x] Recalcular a duração ao abrir, reabrir ou voltar ao popup.

Validação de 2026-08-29: seleção e início aprovados em 12 testes novos, dentro de 196 testes
unitários totais. O popup comprovou rádios nativos com seleção transitória por identidade, resolução
do item atual, UUID e timestamp fornecidos pela borda e snapshots mínimos exatos. A interface só
refletiu sucesso depois da escrita, bloqueou cliques concorrentes e segunda sessão ativa, convergiu
em conflito e preservou retry após quota ou indisponibilidade. Uma tarefa removida durante escrita
não alterou a sessão já enviada, e desmontar o popup não cancelou a persistência nem atualizou a
árvore React encerrada. Sessões em execução e pausadas foram reconstruídas do armazenamento com
tarefa, lista, estado, duração e próxima ação; o relógio visual recalculou a duração a cada segundo.
`pnpm check`, `pnpm test:e2e` (2 testes), `pnpm build`, `pnpm audit --prod` (sem vulnerabilidades
conhecidas) e `git diff --check` passaram. O manifesto de produção manteve somente `identity`,
`storage` e o host da Google Tasks API, sem background ou content script.

### 6.2 Controles

- [x] Conectar pausar, retomar, finalizar e cancelar às transições do domínio.
- [x] Cancelar diretamente após ação explícita, sem criar etapa adicional de confirmação.
- [x] Não criar histórico ao cancelar.
- [x] Bloquear ações concorrentes enquanto uma transição persistente estiver sendo confirmada sem ocultar conflitos reais.
- [x] Informar falha de persistência e manter ação recuperável.
- [x] Refletir mudanças realizadas em outra instância sem exigir reabertura do popup.

Validação de 2026-08-29: controles persistentes aprovados em 17 testes unitários novos, dentro de
213 testes totais, e em três novos fluxos Playwright, dentro de cinco testes E2E. Pausa, retomada,
finalização e cancelamento usaram a sessão observada e timestamps da borda, aguardaram a escrita e
bloquearam cliques concorrentes. Cancelamento direto com duração zero ou positiva não criou
histórico. Falhas de quota, Storage, dados inválidos e relógio foram sanitizadas e permaneceram
recuperáveis; conflitos convergiram para o estado mais recente. Finalização pendente congelou a
duração concluída, evitou contagem diária dupla e ofereceu somente a limpeza segura. Duas páginas
reais refletiram pausa sem recarga, e os controles continuaram funcionais com o Google offline.
`pnpm check`, `pnpm test:e2e` (5 testes), `pnpm build`, `pnpm audit --prod` (sem vulnerabilidades
conhecidas) e `git diff --check` passaram. O manifesto manteve somente `identity`, `storage` e o
host da Google Tasks API, sem background ou content script.

### 6.3 Histórico

- [x] Exibir sessões concluídas da mais recente para a mais antiga.
- [x] Exibir tarefa, lista, horário e duração de cada sessão.
- [x] Usar snapshots históricos mesmo quando tarefa ou lista não estiverem mais disponíveis.
- [x] Manter cada registro imutável no MVP.
- [x] Não oferecer edição ou exclusão de histórico.
- [x] Manter o histórico disponível offline.

Validação de 2026-08-29: histórico local detalhado aprovado em nove testes unitários novos, dentro
de 222 testes totais, e em um novo fluxo Playwright, dentro de seis testes E2E. A apresentação
ordenou uma cópia dos registros por conclusão, início e ID, preservou snapshots e dados remotos
como texto, formatou intervalos no fuso local e manteve a duração executada independente das
pausas. Estados vazio, indisponível e preservado após falha foram distinguidos. Lotes transitórios
de 20 registros reiniciaram na remontagem, e finalização, observação entre instâncias e falha do
Google atualizaram ou preservaram a lista sem edição ou exclusão. O Chromium carregou 21 registros
diretamente de `chrome.storage.local`, confirmou os 20 mais recentes e tornou o restante acessível
pelo controle de expansão. `pnpm check`, `pnpm test:e2e` (6 testes), `pnpm build`,
`pnpm audit --prod` (sem vulnerabilidades conhecidas) e `git diff --check` passaram. O manifesto
permaneceu sem novos acessos, background ou content script.

### 6.4 Total diário

- [x] Exibir o total efetivamente executado no dia civil local atual.
- [x] Somar sessões concluídas que interceptem o dia atual.
- [x] Somar a parcela transcorrida da sessão ativa em execução.
- [x] Excluir pausas e a parte dos períodos situada fora do dia atual.
- [x] Recalcular quando o relógio atravessar a meia-noite e quando o popup for reaberto.
- [x] Recalcular o pertencimento ao dia quando o fuso local mudar sem alterar durações históricas.

Validação de 2026-08-31: total diário e continuidade local aprovados em cinco testes de interface
novos, dentro de 227 testes unitários totais, e em um fluxo Playwright ampliado, dentro de seis
testes E2E. O popup somou apenas as parcelas históricas do dia local, incluiu períodos fechados e
o período corrente, congelou o total durante pausa e o preservou após retomada e finalização sem
duplicidade. Relógio controlado comprovou passagem da meia-noite, remontagem e mudança de fuso sem
alterar timestamps, períodos ou duração persistida. Uma falha explícita da integração Google não
modificou o estado local nem impediu pausa, retomada e finalização. No Chromium, uma sessão e um
histórico semeados em `chrome.storage.local` permaneceram corretos durante pausa, avanço do
relógio, retomada, recarga, finalização e reabertura sem autorização Google. `pnpm check`,
`pnpm test:e2e` (6 testes), `pnpm build`, `pnpm audit --prod` (sem vulnerabilidades conhecidas) e
`git diff --check` passaram. O manifesto manteve somente `identity`, `storage` e o host da Google
Tasks API, sem background ou content script.

### 6.5 Testes do fluxo local

- [x] Testar seleção, início e bloqueio de segunda sessão pela interface.
- [x] Testar pausa, retomada, finalização e cancelamento pela interface.
- [x] Testar recuperação visual de sessão em execução e pausada.
- [x] Testar histórico, snapshots e ordenação recente.
- [x] Testar total diário durante execução, pausa e depois da finalização.
- [x] Testar continuidade completa do fluxo local sem acesso ao Google.

## 7. Conclusão no Google Tasks

### 7.1 Operação remota independente

- [x] Oferecer a conclusão da tarefa somente depois de a sessão estar salva localmente.
- [x] Exigir ação explícita em controle claramente identificado para concluir a tarefa.
- [x] Executar `tasks.patch`, nunca `tasks.update`.
- [x] Enviar `status: "completed"` e adicionar `completed` somente se o contrato real demonstrar que é necessário.
- [x] Não reenviar título, notas, data agendada, posição ou outros campos da tarefa.
- [x] Manter conclusão remota e histórico local como operações independentes.

Validação de 2026-08-31: conclusão remota transitória aprovada em nove testes de interface novos,
dentro de 236 testes unitários totais. O controle apareceu somente após a persistência local
confirmada e exigiu clique explícito para obter autorização silenciosa e chamar a API. Estados
ocupado, sucesso, falha, cancelamento, remontagem e desmontagem foram tratados sem alterar ou
duplicar o histórico; snapshots permaneceram texto não confiável e o sucesso removeu somente a
tarefa correspondente do catálogo em memória. Os testes REST existentes confirmaram `PATCH`, URL
codificada, corpo exclusivo `{ "status": "completed" }`, campos parciais da resposta e ausência de
título, notas, data, posição ou `completed` na requisição. `pnpm check`, `pnpm test:e2e` (6 testes),
`pnpm build`, `pnpm audit --prod` (sem vulnerabilidades conhecidas) e `git diff --check` passaram.
O manifesto manteve somente `identity`, `storage` e o host da Google Tasks API, sem background ou
content script. Falhas específicas, renovação durante a conclusão e o smoke com ocorrência
recorrente permanecem para as etapas seguintes.

Smoke manual de 2026-08-31: em uma conta de teste real, uma tarefa comum foi concluída pelo
controle explícito do Pacebit e apareceu concluída no Google Tasks. Ao fechar e reabrir o popup, o
controle transitório de conclusão não reapareceu, enquanto o registro local permaneceu salvo.

### 7.2 Falhas e repetição

- [x] Informar falha remota sem remover, alterar, duplicar ou ocultar o histórico.
- [x] Permitir nova tentativa enquanto o resultado da sessão estiver visível.
- [x] Tornar a repetição segura sem executar mutações locais duplicadas.
- [x] Tratar tarefa removida sem tentar recriá-la.
- [x] Tratar tarefa já concluída em outro cliente preservando o histórico.
- [x] Tratar autorização expirada durante a conclusão e permitir retomada contextual.

Validação de 2026-08-31: falhas e repetição segura aprovadas em onze testes de interface novos,
dentro de 247 testes unitários totais. O popup diferenciou acesso negado, limite, indisponibilidade,
resposta inválida, falha inesperada e ausência da tarefa sem expor motivos internos nem alterar o
histórico. Falhas recuperáveis mantiveram retry; `404` encerrou o fluxo sem recriar a tarefa e
removeu somente o item obsoleto do catálogo em memória. Uma resposta ambígua seguida de
`completed` repetiu apenas o mesmo patch remoto e preservou um único registro local. Um `401`
removeu e renovou o token antes de um único segundo `PATCH`; outro `401` não iniciou loop. Quando
a renovação silenciosa falhou, somente o controle contextual **Autorizar e tentar novamente**
iniciou OAuth interativo. Desmontagem e nova finalização abortaram operações obsoletas sem mensagem
tardia. `pnpm check`, `pnpm test:e2e` (6 testes), `pnpm build`, `pnpm audit --prod` (sem
vulnerabilidades conhecidas) e `git diff --check` passaram. O manifesto manteve somente `identity`,
`storage` e o host da Google Tasks API, sem background ou content script.

### 7.3 Testes e smoke real

- [x] Testar que a conclusão só ocorre por ação explícita posterior à persistência local.
- [x] Testar método, URL e corpo mínimos do `PATCH`.
- [x] Testar que campos alheios à conclusão nunca são enviados.
- [x] Testar falha, retry, token inválido, tarefa ausente e tarefa já concluída.
- [x] Testar que nenhuma resposta remota modifica o registro histórico.
- [x] Executar smoke documentado com conta de teste e tarefa comum.
- [x] Executar smoke documentado com uma ocorrência recorrente conhecida.
- [x] Documentar o comportamento real da próxima ocorrência e qualquer limitação observada sem prometer regra não exposta pela API.

Smoke manual de 2026-08-31: uma ocorrência recorrente conhecida foi medida, finalizada e concluída
com sucesso pelo Pacebit. O Google Tasks sinalizou a próxima recorrência, mas não criou previamente
uma nova tarefa consumível pela API; no comportamento observado, essa ocorrência é materializada
pelo Google somente no dia correspondente. O histórico local permaneceu com exatamente uma sessão
e, após fechar e reabrir o popup, o cartão transitório de conclusão não reapareceu. Essa observação
descreve somente o teste realizado e não estabelece uma regra de recorrência além do contrato
público da API.

## 8. Robustez, E2E e segurança

Por decisão registrada em 2026-08-31, as seções 8.1 e 8.2 são pós-lançamento e não
bloqueiam a primeira submissão. Seus itens permanecem abertos para preservar a rastreabilidade do
risco residual. A regressão E2E existente continua obrigatória, a seção 8.3 permanece bloqueante e
a instalação e o smoke do ZIP candidato em perfil limpo continuam exigidos pela seção 9.3.

### 8.1 Fluxos E2E — pós-lançamento, não bloqueante

- [ ] Carregar o build da extensão em perfil persistente controlado do Chromium pelo Playwright.
- [ ] Cobrir conexão controlada, paginação, seleção, início, pausa, retomada e finalização.
- [ ] Cobrir conclusão remota separada da finalização local.
- [ ] Cobrir reabertura do popup e recuperação da sessão.
- [ ] Cobrir funcionamento local offline e recuperação posterior da integração.
- [ ] Cobrir conflito entre duas instâncias do popup sem sessão ou histórico duplicado.
- [ ] Manter dados e credenciais reais fora dos testes automatizados comuns.

### 8.2 Resiliência e perfil limpo — pós-lançamento, não bloqueante

- [ ] Verificar manualmente reinício do Chrome com sessão em execução e pausada.
- [ ] Verificar recarga ou atualização da extensão com sessão em execução e pausada.
- [ ] Instalar o pacote em um perfil limpo e executar a jornada principal.
- [ ] Verificar estados de falha de autenticação, rede, API, persistência e quota.
- [ ] Verificar passagem da meia-noite ou equivalente controlado no fluxo integrado.
- [ ] Revisar navegação por teclado, foco visível, nomes acessíveis e comunicação sem dependência de cor.

### 8.3 Auditoria de segurança e privacidade

- [x] Auditar o manifesto gerado e confirmar somente os acessos aprovados no escopo.
- [x] Auditar o bundle e confirmar ausência de client secret, token, código remoto e `eval`.
- [x] Auditar logs e confirmar ausência de tokens, respostas completas e dados pessoais desnecessários.
- [x] Auditar dependências de produção e remover as que não tenham responsabilidade demonstrada.
- [x] Confirmar ausência de backend, banco de dados, telemetria, analytics e sincronização.
- [x] Confirmar ausência de content scripts e acesso ao DOM do Google Tasks.
- [x] Confirmar que dados de usuário são persistidos apenas em `storage.local` e não enviados a terceiros além da API Google necessária.

Validação de 2026-08-31: a auditoria do build de produção confirmou Manifest V3 com somente
`identity`, `storage`, o host `https://tasks.googleapis.com/*` e o scope Google Tasks, sem
background, content scripts ou permissões adicionais. Os dez arquivos empacotados usam apenas
scripts e estilos locais; o bundle não contém `eval`, construtor dinâmico de funções, importação
remota, script remoto, arquivo de ambiente, chave privada, client secret ou token. Client ID OAuth
e chave pública da extensão permanecem identificadores públicos esperados. O código da aplicação
não produz logs nem usa HTML remoto como confiável; o único `fetch` remoto aponta para a Tasks API
por HTTPS, e tokens são obtidos pelo `chrome.identity` sem persistência própria. Somente
`local:active-session` e `local:session-history` são persistidos; não há backend, banco, sync,
telemetria ou analytics. A busca por assinaturas de segredo no estado atual e em todo o histórico
Git não encontrou ocorrências. React e React DOM são as únicas dependências de produção e possuem
uso direto no popup; quatro GitHub Actions estão fixadas por SHA completo. URLs de documentação e
logs internos presentes nas dependências empacotadas não recebem dados do Pacebit nem representam
tráfego ou logs da aplicação. `pnpm install --frozen-lockfile`, `pnpm check` (247 testes),
`pnpm test:e2e` (6 testes), `pnpm build`, `pnpm audit --prod` (sem vulnerabilidades conhecidas) e
as inspeções estruturais passaram.

## 9. Documentação e pacote para submissão

### 9.1 Documentação do projeto

- [x] Criar README com objetivo, requisitos, instalação local e jornada principal.
- [x] Documentar configuração do projeto Google Cloud, client ID de desenvolvimento e ID da extensão.
- [x] Documentar todos os scripts de desenvolvimento e validação.
- [x] Documentar como executar testes unitários, E2E controlados e smokes reais.
- [x] Documentar arquitetura mínima, responsabilidades e persistência local.
- [x] Documentar limitações conhecidas, incluindo recorrência e ausência de sincronização.
- [x] Manter `AGENTS.md`, `SCOPE.md` e esta SPEC coerentes com o estado final.

Validação em 31 de agosto de 2026: o `README.md` documenta jornada, requisitos, ambientes OAuth,
configuração Google Cloud, scripts, testes, arquitetura, persistência e limitações. Foram adicionados
licença MIT, política de privacidade, termos de uso e referências cruzadas validadas entre os
documentos. Nenhum client ID OAuth real foi registrado na documentação.

### 9.2 Privacidade, consentimento e revisão

- [x] Criar política de privacidade coerente com leitura do Google Tasks e armazenamento local.
- [x] Declarar dados acessados, finalidade, retenção, ausência de venda, compartilhamento próprio e sincronização.
- [x] Preparar justificativa do scope completo de Google Tasks baseada somente em leitura e conclusão explícita.
- [x] Preparar texto da tela de consentimento coerente com a interface e a política de privacidade.
- [x] Preparar instruções de revisão que demonstrem autenticação, timer, histórico e conclusão explícita.
- [ ] Preparar os materiais exigidos para verificação OAuth aplicável sem registrar aprovação ainda não recebida.
- [x] Preparar descrição, ícones, imagens e declarações de privacidade exigidas pela Chrome Web Store.

Validação em 31 de agosto de 2026: `pnpm install --frozen-lockfile`, `pnpm check`,
`pnpm test:e2e`, `pnpm build`, `pnpm audit --prod` e `git diff --check` foram
concluídos. Passaram 247 testes unitários e 6 testes E2E. Foram inspecionados cinco PNGs:
ícone 128×128, tile 440×280 e três screenshots 1280×800 com dados sintéticos. Dimensões e links
Markdown foram validados automaticamente. O bundle de produção não contém a página de preview nem
seus dados, e o manifesto manteve somente os acessos aprovados. Política, termos, textos bilíngues,
declarações e roteiro de revisão permanecem rascunhos locais. O pacote final de verificação OAuth
continua aberto até existirem domínio próprio, URLs públicas e vídeo real.

### 9.3 Build distribuível

- [ ] Definir comando ou procedimento reprodutível para gerar o ZIP de submissão.
- [ ] Gerar build de produção com lockfile imutável e árvore de trabalho conhecida.
- [ ] Confirmar que o ZIP contém somente arquivos necessários à extensão.
- [ ] Instalar exatamente o pacote gerado em perfil limpo.
- [ ] Executar smoke final da jornada principal a partir do pacote.
- [ ] Registrar versão, origem do commit e checks executados para o artefato candidato.
- [ ] Confirmar que os materiais estão prontos para submissão sem depender da aprovação externa.

## 10. Gate final do MVP

### 10.1 Matriz dos critérios de aceite

- [ ] **CA-01 — autenticação e tarefas:** comprovar ação explícita, conta do perfil e tarefas elegíveis de todas as listas.
- [ ] **CA-02 — paginação:** comprovar consumo de todas as páginas sem truncamento silencioso.
- [ ] **CA-03 — prioridade:** comprovar sessão ativa, vencidas, hoje, sem data e futuras na ordem definida.
- [ ] **CA-04 — sessão única:** comprovar que somente uma sessão pode permanecer ativa.
- [ ] **CA-05 — transições:** comprovar pausa, retomada, finalização e cancelamento conforme a tabela do escopo.
- [ ] **CA-06 — recuperação:** comprovar duração correta após reabertura do popup e recriação dos contextos; reinício do Chrome e atualização da extensão permanecem na bateria pós-lançamento da 8.2.
- [ ] **CA-07 — finalização local:** comprovar exatamente um histórico salvo antes da remoção da sessão ativa.
- [ ] **CA-08 — total de hoje:** comprovar somente tempo executado no dia local, inclusive através da meia-noite.
- [ ] **CA-09 — indisponibilidade do Google:** comprovar sessão e histórico locais utilizáveis offline.
- [ ] **CA-10 — conclusão remota:** comprovar ação explícita, `PATCH` mínimo e independência do histórico diante de falha.
- [ ] **CA-11 — estados da interface:** comprovar vazio, carregamento, autenticação e falhas compreensíveis e recuperáveis.
- [ ] **CA-12 — concorrência:** comprovar ausência de sessões e finalizações duplicadas em duas instâncias.
- [ ] **CA-13 — processamento local:** comprovar ausência de envio próprio e sincronização de tarefas ou sessões.
- [ ] **CA-14 — declarações de acesso:** comprovar coerência entre manifesto, consentimento OAuth e política de privacidade.
- [ ] **CA-15 — recorrência:** comprovar conclusão real de ocorrência recorrente e documentar limitações sem afetar o histórico.

### 10.2 Validação candidata à submissão

- [ ] Executar `pnpm install --frozen-lockfile` em ambiente limpo.
- [ ] Executar `pnpm check` sem erros ou testes ignorados que ocultem risco do MVP.
- [ ] Executar `pnpm build` e inspecionar o manifesto e o bundle gerados.
- [ ] Executar `pnpm test:e2e` com a extensão carregada no Chromium.
- [ ] Executar os smokes reais com tarefa comum e recorrente.
- [ ] Revisar cada item da matriz de aceite e anexar evidência verificável à validação correspondente.
- [ ] Revisar documentação, política de privacidade, permissões, scope e materiais de revisão.
- [ ] Instalar e validar o ZIP candidato em perfil limpo.
- [ ] Manter como `[ ]` qualquer item sem implementação e evidência correspondente.
- [ ] Declarar o MVP pronto para submissão somente quando todos os itens bloqueantes das seções 1 a 10 estiverem concluídos; as seções 8.1 e 8.2 são as exceções pós-lançamento registradas.

## 11. Backlog pós-MVP

Esta seção não bloqueia o estado **pronto para submissão**. Os itens somente podem ser promovidos ao MVP após alteração explícita do `SCOPE.md` e não justificam arquitetura preventiva.

As seções 8.1 e 8.2 também integram este backlog pós-lançamento. Seus checklists permanecem nas
seções originais para manter a numeração e a rastreabilidade das verificações adiadas.

- [ ] Considerar correção ou exclusão de registros históricos.
- [ ] Considerar notificações e alarmes.
- [ ] Considerar Pomodoro e métodos de foco configuráveis.
- [ ] Considerar estatísticas, gráficos e exportação.
- [ ] Considerar backup ou sincronização entre dispositivos.
- [ ] Considerar suporte a outras plataformas ou integrações.
- [ ] Considerar recursos pagos.

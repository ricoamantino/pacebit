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

- [ ] Calcular duração somente pela soma das interseções dos períodos executados.
- [ ] Excluir integralmente os intervalos pausados.
- [ ] Calcular a parcela de um período que pertence a um dia civil local.
- [ ] Incluir no cálculo a parcela corrente de uma sessão em execução sem persistir atualizações por segundo.
- [ ] Recalcular corretamente após passagem da meia-noite.
- [ ] Garantir que mudança de fuso não altere durações registradas e apenas redefina apresentação e pertencimento ao dia local.
- [ ] Tratar datas agendadas do Google Tasks como datas civis, sem interpretar horário do campo `due`.

### 2.4 Testes do domínio

- [x] Testar todas as transições válidas da tabela do escopo.
- [x] Testar transições inválidas, ações repetidas e cliques rápidos.
- [x] Testar duração com nenhum, um e múltiplos intervalos de pausa.
- [x] Testar finalização em execução e em pausa.
- [x] Testar cancelamento com e sem tempo registrado.
- [x] Testar sessão de duração muito curta.
- [ ] Testar períodos que começam ou terminam nos limites da meia-noite.
- [ ] Testar total diário com sessão ativa, pausada e concluída.
- [ ] Testar mudança de dia e mudança de fuso horário com relógio controlado.

## 3. Persistência e concorrência

### 3.1 WXT Storage

- [ ] Definir item `local:` conhecido para a sessão ativa com `storage.defineItem`.
- [ ] Definir item `local:` conhecido para o histórico com `storage.defineItem`.
- [ ] Não usar `session:`, `sync:` nem wrapper genérico sobre WXT Storage.
- [ ] Fazer leitura ausente produzir estado inicial válido.
- [ ] Detectar dados persistidos inválidos ou incompatíveis sem tratá-los silenciosamente como válidos.
- [ ] Usar versão e migração nativas somente quando uma mudança real de schema exigir.
- [ ] Não persistir preferências, tokens nem cópias completas das respostas do Google Tasks.

### 3.2 Operações persistentes

- [ ] Persistir cada transição confirmada antes de apresentá-la como concluída.
- [ ] Salvar exatamente um registro histórico antes de remover a sessão ativa durante a finalização.
- [ ] Preservar a sessão ativa se a escrita do histórico ou a remoção subsequente falhar.
- [ ] Repetir uma finalização interrompida sem duplicar o histórico.
- [ ] Tratar falha de escrita e quota com mensagem recuperável e sem falso sucesso.
- [ ] Recuperar sessão e histórico após remontagem do React e reabertura do popup.
- [ ] Recuperar sessão e histórico após reinício do Chrome, atualização ou recarga da extensão e recriação de contextos.
- [ ] Manter pausa, retomada, finalização e cancelamento disponíveis sem conexão com o Google.

### 3.3 Coordenação entre instâncias

- [ ] Fazer instâncias abertas observarem e convergirem para o estado persistido mais recente.
- [ ] Associar cada comando à versão ou identidade do estado sobre o qual foi iniciado.
- [ ] Rejeitar uma transição baseada em estado obsoleto e recarregar o estado atual.
- [ ] Impedir que duas instâncias iniciem sessões diferentes simultaneamente.
- [ ] Impedir que pausas ou retomadas concorrentes dupliquem ou percam períodos confirmados.
- [ ] Impedir que finalizações concorrentes produzam dois registros históricos.
- [ ] Avaliar primeiro coordenação por persistência e APIs nativas; adicionar mensageria ou escritor único apenas se necessário para preservar as invariantes.
- [ ] Manter qualquer background introduzido reconstruível pela persistência e limitado à responsabilidade concreta que o exigir.

### 3.4 Testes de persistência e concorrência

- [ ] Testar recuperação de sessão em execução, pausada e ausente.
- [ ] Testar recuperação de histórico vazio e preenchido.
- [ ] Testar dados ausentes, inválidos e incompatíveis.
- [ ] Testar falha em cada escrita relevante da finalização.
- [ ] Testar quota excedida sem perda silenciosa de estado.
- [ ] Testar início, pausa, retomada, finalização e cancelamento a partir de duas instâncias.
- [ ] Testar que exatamente um comando concorrente vence e o outro recebe conflito recuperável.
- [ ] Testar que nenhuma falha remota do Google altera dados locais válidos.

## 4. Google Cloud, OAuth e Tasks API

### 4.1 Configuração Google

- [x] Criar projeto Google Cloud próprio do Pacebit para o ambiente de distribuição.
- [x] Habilitar a Google Tasks API no projeto.
- [x] Definir um ID estável para a extensão distribuível.
- [x] Criar credencial OAuth do tipo extensão Chrome vinculada ao ID estável.
- [ ] Manter configurações de desenvolvimento e distribuição separadas quando necessário.
- [ ] Configurar marca, audiência, tela de consentimento e scope usado pelo produto.
- [x] Confirmar que nenhum client secret, token ou credencial privada entra no repositório ou bundle.

Validação de 2026-08-28: projeto Google Cloud e Google Tasks API habilitada confirmados pelo
fluxo do console. A chave pública do item deriva o ID estável
`jkpogflkipedlninnnplenlajoofkkfp`, que corresponde à credencial OAuth Chrome criada. O client ID
real permanece no `.env.local` ignorado; `wxt prepare`, TypeScript e build MV3 foram aprovados, e
repositório e bundle não contêm client secret, token, chave privada ou API key.

### 4.2 Autenticação

- [ ] Encapsular `chrome.identity` fora dos componentes React.
- [ ] Tentar obter token de forma não interativa depois de uma autorização prévia.
- [ ] Iniciar o fluxo interativo somente após ação explícita e contextualizada do usuário.
- [ ] Usar a conta Google associada ao perfil atual do Chrome sem criar seletor próprio.
- [ ] Remover token inválido do cache da Identity API antes de solicitar renovação.
- [ ] Não armazenar tokens em WXT Storage nem manter cache paralelo.
- [ ] Tratar token ausente, autorização recusada, token expirado ou revogado e renovação necessária.
- [ ] Expor à interface estados de autenticação pequenos e sanitizados, sem detalhes internos.

### 4.3 Cliente REST

- [ ] Criar cliente REST direto para `https://tasks.googleapis.com/tasks/v1` usando o token OAuth.
- [ ] Não adicionar API key, SDK remoto, cliente JavaScript remoto ou abstração para múltiplos provedores.
- [ ] Centralizar operações concretas de listas, tarefas e conclusão fora do React.
- [ ] Solicitar somente campos consumidos pelo produto e incluir `nextPageToken` nas respostas parciais.
- [ ] Tratar respostas sem corpo esperado, payload inválido, HTTP não exitoso, rede, autorização e limite.
- [ ] Sanitizar erros antes de entregá-los à interface ou aos logs.
- [ ] Permitir cancelamento ou descarte seguro de resultados obsoletos do carregamento.

### 4.4 Listas e tarefas

- [ ] Paginar `tasklists.list` até consumir todos os `nextPageToken`.
- [ ] Paginar `tasks.list` de cada lista até consumir todos os `nextPageToken`.
- [ ] Enviar explicitamente `showCompleted=false`, `showDeleted=false`, `showHidden=false` e `showAssigned=false`.
- [ ] Ler os campos necessários para IDs, títulos, lista, data agendada, hierarquia, posição e estado.
- [ ] Incluir subtarefas próprias como tarefas elegíveis independentes.
- [ ] Excluir tarefas concluídas, excluídas, ocultas e atribuídas por Docs ou Chat Spaces.
- [ ] Não aplicar limite arbitrário nem declarar resultado parcial como completo.
- [ ] Representar falha por lista e permitir nova tentativa sem apagar resultados locais válidos.

### 4.5 Testes da integração controlada

- [ ] Testar autenticação sem interação quando o token estiver disponível.
- [ ] Testar autorização interativa somente depois da ação do usuário.
- [ ] Testar token inválido, remoção do cache e nova tentativa.
- [ ] Testar paginação de listas e tarefas em uma e várias páginas.
- [ ] Testar presença dos quatro filtros explícitos e dos campos parciais necessários.
- [ ] Testar lista vazia, subtarefa, tarefa atribuída, resposta inválida, falhas HTTP e rede.
- [ ] Testar carregamento parcial sem apresentá-lo como completo.
- [ ] Manter os testes comuns independentes de uma conta Google e de chamadas reais.

## 5. Popup e apresentação das tarefas

### 5.1 Estrutura e estados

- [ ] Criar a composição principal do popup em português do Brasil.
- [ ] Exibir estado desconectado com explicação e ação contextual para conectar.
- [ ] Exibir estados distintos de conectando, carregando tarefas, vazio real, resultado parcial, offline e erro recuperável.
- [ ] Manter sessão ativa, total do dia e histórico acessíveis quando o Google estiver indisponível.
- [ ] Oferecer nova tentativa para autenticação e carregamento sem recarregar ou apagar dados locais.
- [ ] Não expor tokens, URLs internas, payloads REST, stack traces ou detalhes de implementação.

### 5.2 Priorização e carregamento

- [ ] Apresentar primeiro a sessão ativa, quando existir.
- [ ] Ordenar tarefas vencidas da data mais antiga para a mais recente.
- [ ] Apresentar depois tarefas de hoje, sem data e futuras da data mais próxima para a mais distante.
- [ ] Dentro do mesmo grupo e data, desempatar pela ordem estável das listas retornadas, pela `position` da tarefa e finalmente pelo ID.
- [ ] Preservar a ordem já apresentada quando novas páginas não alterarem a prioridade relativa dos itens existentes.
- [ ] Exibir o nome da lista junto de cada tarefa.
- [ ] Tratar subtarefas como itens independentes sem oferecer edição de hierarquia.
- [ ] Indicar carregamento progressivo enquanto ainda houver páginas e nunca rotular resultado parcial como completo.

### 5.3 Acessibilidade e comportamento

- [ ] Usar regiões, títulos, listas, botões e formulários semanticamente adequados.
- [ ] Associar rótulos acessíveis a todos os controles.
- [ ] Garantir foco visível e ordem de teclado previsível.
- [ ] Não depender somente de cor para comunicar prioridade, estado ou falha.
- [ ] Desabilitar ações impossíveis com explicação curta.
- [ ] Manter títulos de tarefa e lista como texto não confiável, sem injeção de HTML.
- [ ] Garantir comportamento seguro sob remontagem do React e efeitos repetidos em desenvolvimento.

### 5.4 Testes do popup

- [ ] Testar os estados desconectado, conectando, carregando, vazio, parcial, offline e erro recuperável com Testing Library.
- [ ] Testar a prioridade completa e o desempate estável das tarefas.
- [ ] Testar listas com títulos iguais, subtarefas e carregamento de novas páginas.
- [ ] Testar que resultado parcial nunca é comunicado como completo.
- [ ] Testar foco, nomes acessíveis, teclado e estados desabilitados dos controles críticos.
- [ ] Testar que dados remotos são renderizados como texto.

## 6. Execução, histórico e total diário

### 6.1 Seleção e sessão ativa

- [ ] Permitir seleção transitória somente de tarefa carregada pela API.
- [ ] Iniciar a sessão persistindo imediatamente IDs e snapshots mínimos de tarefa e lista.
- [ ] Impedir uma segunda sessão ativa e explicar como encerrar ou cancelar a atual.
- [ ] Apresentar tarefa, lista, estado, duração atual e ação válida seguinte.
- [ ] Atualizar a duração visual por relógio de interface sem transformar o contador em fonte de verdade.
- [ ] Recalcular a duração ao abrir, reabrir ou voltar ao popup.

### 6.2 Controles

- [ ] Conectar pausar, retomar, finalizar e cancelar às transições do domínio.
- [ ] Solicitar confirmação curta ao cancelar quando já existir tempo registrado.
- [ ] Não criar histórico ao cancelar.
- [ ] Bloquear ações concorrentes enquanto uma transição persistente estiver sendo confirmada sem ocultar conflitos reais.
- [ ] Informar falha de persistência e manter ação recuperável.
- [ ] Refletir mudanças realizadas em outra instância sem exigir reabertura do popup.

### 6.3 Histórico

- [ ] Exibir sessões concluídas da mais recente para a mais antiga.
- [ ] Exibir tarefa, lista, horário e duração de cada sessão.
- [ ] Usar snapshots históricos mesmo quando tarefa ou lista não estiverem mais disponíveis.
- [ ] Manter cada registro imutável no MVP.
- [ ] Não oferecer edição ou exclusão de histórico.
- [ ] Manter o histórico disponível offline.

### 6.4 Total diário

- [ ] Exibir o total efetivamente executado no dia civil local atual.
- [ ] Somar sessões concluídas que interceptem o dia atual.
- [ ] Somar a parcela transcorrida da sessão ativa em execução.
- [ ] Excluir pausas e a parte dos períodos situada fora do dia atual.
- [ ] Recalcular quando o relógio atravessar a meia-noite e quando o popup for reaberto.
- [ ] Recalcular o pertencimento ao dia quando o fuso local mudar sem alterar durações históricas.

### 6.5 Testes do fluxo local

- [ ] Testar seleção, início e bloqueio de segunda sessão pela interface.
- [ ] Testar pausa, retomada, finalização e cancelamento pela interface.
- [ ] Testar recuperação visual de sessão em execução e pausada.
- [ ] Testar histórico, snapshots e ordenação recente.
- [ ] Testar total diário durante execução, pausa e depois da finalização.
- [ ] Testar continuidade completa do fluxo local sem acesso ao Google.

## 7. Conclusão no Google Tasks

### 7.1 Operação remota independente

- [ ] Oferecer a conclusão da tarefa somente depois de a sessão estar salva localmente.
- [ ] Exigir ação explícita em controle claramente identificado para concluir a tarefa.
- [ ] Executar `tasks.patch`, nunca `tasks.update`.
- [ ] Enviar `status: "completed"` e adicionar `completed` somente se o contrato real demonstrar que é necessário.
- [ ] Não reenviar título, notas, data agendada, posição ou outros campos da tarefa.
- [ ] Manter conclusão remota e histórico local como operações independentes.

### 7.2 Falhas e repetição

- [ ] Informar falha remota sem remover, alterar, duplicar ou ocultar o histórico.
- [ ] Permitir nova tentativa enquanto o resultado da sessão estiver visível.
- [ ] Tornar a repetição segura sem executar mutações locais duplicadas.
- [ ] Tratar tarefa removida sem tentar recriá-la.
- [ ] Tratar tarefa já concluída em outro cliente preservando o histórico.
- [ ] Tratar autorização expirada durante a conclusão e permitir retomada contextual.

### 7.3 Testes e smoke real

- [ ] Testar que a conclusão só ocorre por ação explícita posterior à persistência local.
- [ ] Testar método, URL e corpo mínimos do `PATCH`.
- [ ] Testar que campos alheios à conclusão nunca são enviados.
- [ ] Testar falha, retry, token inválido, tarefa ausente e tarefa já concluída.
- [ ] Testar que nenhuma resposta remota modifica o registro histórico.
- [ ] Executar smoke documentado com conta de teste e tarefa comum.
- [ ] Executar smoke documentado com uma ocorrência recorrente conhecida.
- [ ] Documentar o comportamento real da próxima ocorrência e qualquer limitação observada sem prometer regra não exposta pela API.

## 8. Robustez, E2E e segurança

### 8.1 Fluxos E2E

- [ ] Carregar o build da extensão em perfil persistente controlado do Chromium pelo Playwright.
- [ ] Cobrir conexão controlada, paginação, seleção, início, pausa, retomada e finalização.
- [ ] Cobrir conclusão remota separada da finalização local.
- [ ] Cobrir reabertura do popup e recuperação da sessão.
- [ ] Cobrir funcionamento local offline e recuperação posterior da integração.
- [ ] Cobrir conflito entre duas instâncias do popup sem sessão ou histórico duplicado.
- [ ] Manter dados e credenciais reais fora dos testes automatizados comuns.

### 8.2 Resiliência e perfil limpo

- [ ] Verificar manualmente reinício do Chrome com sessão em execução e pausada.
- [ ] Verificar recarga ou atualização da extensão com sessão em execução e pausada.
- [ ] Instalar o pacote em um perfil limpo e executar a jornada principal.
- [ ] Verificar estados de falha de autenticação, rede, API, persistência e quota.
- [ ] Verificar passagem da meia-noite ou equivalente controlado no fluxo integrado.
- [ ] Revisar navegação por teclado, foco visível, nomes acessíveis e comunicação sem dependência de cor.

### 8.3 Auditoria de segurança e privacidade

- [ ] Auditar o manifesto gerado e confirmar somente os acessos aprovados no escopo.
- [ ] Auditar o bundle e confirmar ausência de client secret, token, código remoto e `eval`.
- [ ] Auditar logs e confirmar ausência de tokens, respostas completas e dados pessoais desnecessários.
- [ ] Auditar dependências de produção e remover as que não tenham responsabilidade demonstrada.
- [ ] Confirmar ausência de backend, banco de dados, telemetria, analytics e sincronização.
- [ ] Confirmar ausência de content scripts e acesso ao DOM do Google Tasks.
- [ ] Confirmar que dados de usuário são persistidos apenas em `storage.local` e não enviados a terceiros além da API Google necessária.

## 9. Documentação e pacote para submissão

### 9.1 Documentação do projeto

- [ ] Criar README com objetivo, requisitos, instalação local e jornada principal.
- [ ] Documentar configuração do projeto Google Cloud, client ID de desenvolvimento e ID da extensão.
- [ ] Documentar todos os scripts de desenvolvimento e validação.
- [ ] Documentar como executar testes unitários, E2E controlados e smokes reais.
- [ ] Documentar arquitetura mínima, responsabilidades e persistência local.
- [ ] Documentar limitações conhecidas, incluindo recorrência e ausência de sincronização.
- [ ] Manter `AGENTS.md`, `SCOPE.md` e esta SPEC coerentes com o estado final.

### 9.2 Privacidade, consentimento e revisão

- [ ] Criar política de privacidade coerente com leitura do Google Tasks e armazenamento local.
- [ ] Declarar dados acessados, finalidade, retenção, ausência de venda, compartilhamento próprio e sincronização.
- [ ] Preparar justificativa do scope completo de Google Tasks baseada somente em leitura e conclusão explícita.
- [ ] Preparar texto da tela de consentimento coerente com a interface e a política de privacidade.
- [ ] Preparar instruções de revisão que demonstrem autenticação, timer, histórico e conclusão explícita.
- [ ] Preparar os materiais exigidos para verificação OAuth aplicável sem registrar aprovação ainda não recebida.
- [ ] Preparar descrição, ícones, imagens e declarações de privacidade exigidas pela Chrome Web Store.

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
- [ ] **CA-06 — recuperação:** comprovar duração correta após popup, Chrome, extensão e contextos reiniciarem.
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
- [ ] Declarar o MVP pronto para submissão somente quando todos os itens bloqueantes das seções 1 a 10 estiverem concluídos.

## 11. Backlog pós-MVP

Esta seção não bloqueia o estado **pronto para submissão**. Os itens somente podem ser promovidos ao MVP após alteração explícita do `SCOPE.md` e não justificam arquitetura preventiva.

- [ ] Considerar correção ou exclusão de registros históricos.
- [ ] Considerar notificações e alarmes.
- [ ] Considerar Pomodoro e métodos de foco configuráveis.
- [ ] Considerar estatísticas, gráficos e exportação.
- [ ] Considerar backup ou sincronização entre dispositivos.
- [ ] Considerar suporte a outras plataformas ou integrações.
- [ ] Considerar recursos pagos.

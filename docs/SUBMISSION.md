# Materiais de submissão do Pacebit

Este documento reúne rascunhos para Google OAuth e Chrome Web Store. Ele não comprova publicação,
verificação ou aprovação. Os placeholders entre colchetes devem ser substituídos somente depois da
criação de um domínio próprio e dos respectivos recursos públicos.

## Pendências externas

- `[PUBLIC_HOME_URL]` — homepage pública em domínio verificável;
- `[PUBLIC_PRIVACY_URL]` — política no mesmo domínio da homepage;
- `[PUBLIC_TERMS_URL]` — termos de uso públicos;
- `[OAUTH_DEMO_VIDEO_URL]` — vídeo não listado demonstrando o fluxo real;
- `[CHROME_WEB_STORE_URL]` — página criada após o primeiro envio.

O repositório GitHub não será apresentado como substituto de domínio próprio para OAuth de
produção.

## Rascunho da homepage

### Título

Pacebit — registre o tempo dedicado às suas tarefas

### Apresentação

O Pacebit é uma extensão para Google Chrome que conecta suas tarefas do Google Tasks a um timer
simples. Escolha uma tarefa, pause quando necessário e mantenha um histórico local do tempo
realmente executado.

### Recursos

- tarefas de todas as listas, priorizadas por data;
- uma sessão ativa por vez, com pausa e retomada;
- total do dia e histórico armazenados localmente;
- conclusão opcional da tarefa no Google após salvar a sessão;
- sem backend, anúncios, telemetria ou sincronização própria.

Links obrigatórios: `[PUBLIC_PRIVACY_URL]`, `[PUBLIC_TERMS_URL]` e contato
`ricoamantino@gmail.com`.

## Google Auth Platform

### Branding e audience

- nome: `Pacebit`;
- e-mail de suporte: `ricoamantino@gmail.com`;
- e-mail de contato: `ricoamantino@gmail.com`;
- homepage: `[PUBLIC_HOME_URL]`;
- política: `[PUBLIC_PRIVACY_URL]`;
- termos: `[PUBLIC_TERMS_URL]`;
- audience: `External`;
- status durante desenvolvimento: `Testing` com contas de teste explícitas;
- cliente: `Chrome Extension`;
- ID da extensão: `jkpogflkipedlninnnplenlajoofkkfp`.

O client ID deve ser copiado do ambiente de distribuição e nunca deste documento. Não existe
client secret.

### Scope

`https://www.googleapis.com/auth/tasks`

### Justificativa em português

O Pacebit usa o Google Tasks como fonte das listas e tarefas apresentadas no popup. O acesso de
escrita é necessário somente porque a Google Tasks API não oferece um scope mais restrito para
marcar uma tarefa como concluída. A extensão lê listas e tarefas e, após ação explícita do usuário,
envia um `PATCH` contendo apenas `status: "completed"`. Ela não cria, edita, move, reorganiza ou
exclui tarefas. Sessão ativa e histórico permanecem no armazenamento local do Chrome e não são
enviados ao desenvolvedor.

### Justification in English

Pacebit uses Google Tasks as the source of the task lists and tasks displayed in its popup. Write
access is required only because the Google Tasks API does not provide a narrower scope for marking
a task as completed. The extension reads task lists and tasks and, after an explicit user action,
sends a `PATCH` containing only `status: "completed"`. It does not create, edit, move, reorder, or
delete tasks. The active session and history remain in Chrome local storage and are never sent to
the developer.

## Roteiro para revisão e vídeo OAuth

Use uma conta exclusiva de teste. Forneça qualquer credencial ao revisor somente pelo canal privado
da plataforma, nunca pelo repositório, vídeo ou descrição pública.

1. Mostrar o projeto Google Cloud, o nome Pacebit e o ID do cliente sem revelar tokens.
2. Abrir `chrome://extensions` e mostrar o ID `jkpogflkipedlninnnplenlajoofkkfp`.
3. Abrir o Google Tasks com uma tarefa comum e uma ocorrência recorrente conhecidas.
4. Abrir o popup e clicar em **Conectar com Google**.
5. Mostrar a tela de consentimento e o scope solicitado.
6. Demonstrar a leitura das listas e tarefas elegíveis.
7. Selecionar uma tarefa, iniciar, pausar, retomar e finalizar a sessão.
8. Mostrar o histórico e o total local antes de qualquer mutação remota.
9. Clicar em **Concluir tarefa no Google** e confirmar o resultado no Google Tasks.
10. Reabrir o popup e mostrar que o histórico permanece e o cartão transitório não reaparece.
11. Repetir a conclusão com uma ocorrência recorrente e documentar somente o comportamento
    observado.

O vídeo deve mostrar claramente a ação explícita que inicia OAuth e a ação separada que conclui a
tarefa. O URL final será registrado como `[OAUTH_DEMO_VIDEO_URL]`.

## Chrome Web Store

### Identificação

- título: `Pacebit`;
- idioma: `Português (Brasil)`;
- categoria: `Produtividade`;
- resumo: `Registre o tempo dedicado às suas tarefas do Google Tasks.`

### Descrição detalhada

Pacebit ajuda você a entender quanto tempo realmente dedica às tarefas do Google Tasks.

Com a extensão, você pode:

- visualizar tarefas não concluídas de todas as suas listas;
- priorizar tarefas vencidas, de hoje, sem data e futuras;
- iniciar uma sessão, pausar e retomar sem perder o tempo correto;
- acompanhar o total executado no dia;
- consultar um histórico local por tarefa e lista;
- escolher separadamente se deseja concluir a tarefa no Google Tasks.

Sessão e histórico ficam no armazenamento local do perfil atual do Chrome. O Pacebit não possui
backend, não sincroniza seus registros, não exibe anúncios e não usa telemetria. O acesso ao Google
Tasks é usado somente para ler tarefas e concluir aquela escolhida explicitamente pelo usuário.

### Justificativas de acesso

| Acesso | Justificativa para revisão |
| --- | --- |
| `identity` | Obter e renovar pelo Chrome o token OAuth da conta autorizada pelo usuário. |
| `storage` | Preservar somente a sessão ativa e o histórico local entre aberturas do popup. |
| `https://tasks.googleapis.com/*` | Ler listas e tarefas e concluir uma tarefa por REST HTTPS. |
| scope `tasks` | A API não oferece scope menor que permita a conclusão explícita. |

O produto não solicita acesso a abas, páginas visitadas, conteúdo de sites, modo anônimo ou
execução em background.

### Declarações de privacidade

Responder conservadoramente no formulário vigente da loja:

- propósito único: medir o tempo dedicado a tarefas do Google Tasks;
- dados tratados: conteúdo fornecido pelo usuário no Google Tasks e autenticação gerenciada pelo
  Chrome;
- finalidade: funcionalidade principal do produto;
- venda de dados: não;
- publicidade, análise, personalização ou crédito: não;
- transferência a terceiros: somente comunicação necessária com a Google Tasks API;
- armazenamento: sessão e histórico locais; tarefas transitórias; token não persistido;
- código remoto: não;
- Limited Use: certificar conformidade.

As opções e rótulos devem ser conferidos novamente no dashboard antes do envio. Uma declaração
local não deve ser convertida em “nenhum dado tratado”, pois títulos e identificadores são usados
pela extensão mesmo sem serem enviados ao desenvolvedor.

## Materiais gráficos

Os arquivos rastreáveis ficam em [`../store-assets`](../store-assets):

- `icon-128.png` — ícone da loja com área útil de 96×96;
- `screenshot-tasks.png` — tarefas priorizadas com dados sintéticos;
- `screenshot-session.png` — sessão ativa e controles;
- `screenshot-history.png` — total diário e histórico local;
- `promo-small.png` — tile promocional de 440×280.

Não há marquee nem vídeo promocional. O vídeo OAuth será produzido separadamente com uma conta de
teste real.

## Pacote candidato

O candidato deve ser o ZIP produzido pelo job `Quality` para um push da `main`, e não uma cópia
posterior de `.output/chrome-mv3`. O procedimento é:

1. confirmar árvore de trabalho limpa, versão e commit com `git status --short`,
   `node -p 'require("./package.json").version'` e `git rev-parse HEAD`;
2. executar `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test:e2e`, `pnpm build`,
   `pnpm zip` e `pnpm audit --prod`;
3. enviar o commit para `main` e aguardar todas as etapas do workflow `CI`;
4. baixar o artefato `pacebit-chrome-mv3-<commit>` da execução aprovada;
5. calcular o SHA-256 e confirmar com `unzip -Z1` que `manifest.json` está na raiz e que somente
   arquivos executáveis e ícones da extensão estão presentes;
6. extrair esse ZIP em diretório temporário, carregar exatamente a pasta extraída em um perfil
   limpo do Chrome e executar a jornada principal com a conta de teste;
7. registrar na SPEC a versão, o commit, a execução do CI, o nome do artefato, o tamanho, o
   SHA-256 e somente os resultados realmente observados.

ZIP, perfil temporário, tokens e credenciais não entram no Git. Materiais gráficos da loja são
enviados separadamente e não pertencem ao pacote executável.

### Candidato 0.1.0

- origem: commit `206e92443357d3749d0b676eb7e7f0fa2276231a` da `main`;
- CI: execução [`33429712289`](https://github.com/ricoamantino/pacebit/actions/runs/33429712289),
  job `Quality` aprovado;
- artefato: `pacebit-chrome-mv3-206e92443357d3749d0b676eb7e7f0fa2276231a`;
- arquivo: `pacebit-0.1.0-chrome.zip`, 93.777 bytes;
- SHA-256: `9f666340d6173e0096df35f994c2e2eaedd6951c9e158f10c9cd712cc1627a8a`;
- inspeção estrutural e de manifesto: aprovada;
- smoke em perfil limpo: pendente.

## Checklist antes de copiar para os consoles

- substituir todos os placeholders;
- publicar homepage, política e termos no mesmo domínio próprio;
- verificar o domínio no Google Search Console com conta proprietária ou editora do projeto;
- confirmar que a política pública é idêntica ao rascunho aprovado;
- conferir scope, ID da extensão, client ID e contas de teste;
- gravar e revisar o vídeo sem dados pessoais ou credenciais;
- conferir as declarações da loja contra o manifesto e o comportamento real;
- não declarar aprovação antes da resposta oficial.

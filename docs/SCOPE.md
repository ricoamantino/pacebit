# Escopo do produto

- Regras de contribuição: [`../AGENTS.md`](../AGENTS.md)
- Plano executável: [`SPEC.md`](SPEC.md)

## 1. Produto

O Pacebit é uma extensão Chrome Manifest V3 para registrar o tempo efetivamente gasto em tarefas do Google Tasks.

O Google Tasks permanece como fonte de verdade para criação, organização, edição e conclusão das tarefas. O Pacebit não pretende substituí-lo nem se tornar um gerenciador de tarefas completo.

O produto existe para responder principalmente:

> Quanto tempo eu realmente gastei nesta tarefa?

### Público inicial

Pessoas que já usam o Google Tasks e querem medir, de maneira simples, o tempo dedicado às próprias tarefas durante o dia.

### Princípio do produto

O Google Tasks organiza o que o usuário precisa fazer. O Pacebit mede a execução desse trabalho.

## 2. Definições

- **Tarefa:** item obtido da Google Tasks API. Seus dados atuais continuam pertencendo ao Google Tasks.
- **Sessão ativa:** medição ainda não encerrada, em execução ou pausada. Somente uma pode existir por vez.
- **Sessão concluída:** registro local e imutável produzido ao finalizar uma sessão ativa.
- **Tempo em execução:** soma apenas dos períodos entre iniciar ou retomar e pausar ou finalizar.
- **Hoje:** dia civil atual no fuso horário local do navegador.
- **Tarefa vencida:** para fins do Pacebit, tarefa não concluída cuja data agendada no Google Tasks é anterior a hoje.
- **Tarefa de hoje:** tarefa não concluída cuja data agendada no Google Tasks é hoje.

Datas e durações são armazenadas em formato independente de fuso horário e apresentadas no fuso local do navegador.

O campo `due` do Google Tasks representa uma data agendada, não um horário nem necessariamente um prazo. O Pacebit deve tratá-lo como data civil, sem interpretar a parte de horário do valor retornado pela API.

## 3. Jornada principal do MVP

O MVP deve permitir que o usuário:

1. Abra o popup e conecte sua conta Google por uma ação explícita.
2. Veja tarefas não concluídas de suas listas, com tarefas vencidas e de hoje em destaque.
3. Selecione uma tarefa e inicie uma sessão.
4. Pause e retome a sessão quantas vezes precisar.
5. Feche e reabra o popup sem perder a correção do timer.
6. Finalize a sessão e veja o tempo registrado no histórico e no total do dia.
7. Escolha, separadamente, se deseja concluir a tarefa no Google Tasks.

O sucesso do MVP será medido pela confiabilidade desse fluxo, não pela quantidade de recursos.

## 4. Escopo funcional

### 4.1 Autenticação

- Usar a conta Google associada ao perfil atual do Chrome.
- Iniciar a autorização interativa somente após uma ação do usuário que explique por que o acesso é necessário.
- Depois da primeira autorização, tentar obter o token de forma não interativa e só voltar a solicitar interação quando ela for necessária.
- Mostrar estados claros de desconectado, conectando e falha de autenticação.
- Permitir nova tentativa após falha, sem expor tokens ou detalhes internos.
- Não implementar conta própria, seletor de múltiplas contas ou sincronização de identidade.

O MVP solicita o scope `https://www.googleapis.com/auth/tasks` porque a conclusão de tarefas exige acesso de escrita. Embora esse scope seja amplo, o Pacebit o utiliza somente para ler listas e tarefas e para marcar como concluída uma tarefa escolhida explicitamente pelo usuário. O MVP não cria, reorganiza, edita conteúdo nem exclui tarefas.

### 4.2 Leitura e apresentação das tarefas

- Ler todas as listas disponíveis e paginar tanto listas quanto tarefas até consumir cada `nextPageToken`.
- Ler tarefas próprias não concluídas, incluindo subtarefas, com os parâmetros `showCompleted=false`, `showDeleted=false`, `showHidden=false` e `showAssigned=false` explícitos.
- Não incluir tarefas concluídas, excluídas, ocultas ou atribuídas por Google Docs ou Chat Spaces no MVP.
- Tratar subtarefas como tarefas elegíveis independentes para medição, sem oferecer edição de hierarquia.
- Não persistir uma cópia completa das listas ou tarefas.
- Exibir, junto da tarefa, contexto suficiente para distinguir títulos iguais, no mínimo o nome da lista.

A ordem inicial deve priorizar:

1. sessão ativa, quando existir;
2. tarefas vencidas, da mais antiga para a mais recente;
3. tarefas de hoje;
4. tarefas sem data;
5. tarefas futuras, da mais próxima para a mais distante.

Dentro de um mesmo grupo e data, preservar uma ordem estável e previsível. A ordenação exata de desempate será definida na especificação sem alterar essa prioridade de produto.

Quando não houver tarefas, a interface deve distinguir entre lista realmente vazia, falha de carregamento e ausência de conexão.

Contas podem conter muitas listas e tarefas. O carregamento pode ser progressivo para manter o popup responsivo, mas não pode aplicar limite arbitrário nem apresentar um resultado parcial como completo. A interface deve indicar quando ainda existem páginas em carregamento.

### 4.3 Seleção e início

- Uma sessão só pode ser iniciada a partir de uma tarefa carregada da Google Tasks API.
- Ao iniciar, salvar imediatamente os identificadores e snapshots mínimos da tarefa e da lista necessários para recuperar e compreender a sessão offline.
- Enquanto existir uma sessão ativa, impedir o início de outra tarefa e explicar que a sessão atual deve ser finalizada ou cancelada primeiro.
- A seleção de uma tarefa sem iniciar o timer é apenas estado transitório da interface e não precisa ser persistida.

### 4.4 Estados e transições do timer

O timer possui três estados persistentes:

- **sem sessão**;
- **em execução**;
- **pausado**.

“Finalizar” e “cancelar” são transições, não estados persistentes.

| Estado atual | Ação | Resultado |
|---|---|---|
| sem sessão | iniciar | cria sessão em execução |
| em execução | pausar | acumula o período atual e mantém sessão pausada |
| pausado | retomar | inicia novo período de execução |
| em execução ou pausado | finalizar | salva uma sessão concluída e volta a sem sessão |
| em execução ou pausado | cancelar | descarta a sessão ativa e volta a sem sessão |

Regras:

- Apenas uma sessão ativa pode existir por vez.
- Pausas não contam na duração.
- Pausar ou retomar repetidamente não pode duplicar períodos de execução.
- Ações repetidas ou cliques rápidos não podem criar sessões históricas duplicadas.
- Finalizar deve salvar o histórico antes de remover a sessão ativa.
- Se o salvamento falhar, a sessão ativa deve ser preservada e o usuário deve poder tentar novamente.
- Cancelar ocorre diretamente após a ação explícita no controle identificado e não cria histórico.
- Uma sessão pode ser finalizada com duração muito curta; o histórico preserva a duração real, sem inventar um mínimo.

### 4.5 Correção e recuperação do timer

O timer nunca depende de um contador em memória como fonte de verdade.

- Persistir timestamps e os períodos de execução necessários para reconstruir a duração.
- Usar `setInterval`, quando necessário, somente para atualizar a apresentação.
- Recalcular a duração ao abrir o popup, recuperar o estado ou retornar à interface.
- Permanecer correto após desmontagem do React, fechamento e reabertura do popup, reinício do Chrome, atualização da extensão e encerramento ou recriação de qualquer contexto da extensão.
- Se existir um background service worker, sua suspensão ou reinicialização não pode afetar o estado.
- Continuar permitindo pausar, retomar, finalizar ou cancelar uma sessão recuperada mesmo quando a Google Tasks API estiver temporariamente indisponível.

Todas as instâncias abertas do popup devem convergir para o estado persistido mais recente. Ações concorrentes não podem criar duas sessões ativas, duplicar períodos de execução, perder uma transição confirmada ou produzir dois registros para a mesma finalização.

### 4.6 Finalização e conclusão da tarefa

Finalizar uma sessão e concluir uma tarefa são operações independentes:

1. o Pacebit salva a sessão concluída localmente;
2. depois oferece a ação de marcar a tarefa como concluída no Google Tasks;
3. a conclusão só ocorre após o usuário acionar um controle claramente identificado; uma segunda confirmação não é obrigatória.

A conclusão deve usar `tasks.patch` e enviar somente os campos necessários para representar a conclusão: `status: "completed"` e, apenas se o contrato real da API exigir, a data `completed`. Não usar `tasks.update` nem reenviar uma representação completa que possa sobrescrever título, notas, data agendada, posição ou outros dados atuais da tarefa.

Se a Google Tasks API falhar, a sessão local permanece salva. A interface deve informar a falha e permitir nova tentativa enquanto o resultado da sessão estiver visível. Não desfazer, duplicar ou ocultar o histórico por causa de uma falha remota.

Se a tarefa tiver sido removida ou concluída em outro cliente, o Pacebit preserva o histórico e apresenta uma mensagem apropriada, sem tentar recriar a tarefa.

A API pública não expõe a regra de recorrência no recurso `Task`. Uma ocorrência recorrente é tratada como qualquer outra tarefa retornada pela API, e o Pacebit não lê, cria nem altera sua recorrência. O comportamento de conclusão e surgimento da próxima ocorrência deve ser validado com conta de teste real antes da distribuição; o escopo não promete comportamento que a API pública não documenta.

### 4.7 Histórico

Cada sessão concluída deve persistir localmente, no mínimo:

- identificador único da sessão;
- ID da tarefa;
- ID da lista;
- título da tarefa no momento da sessão;
- título da lista no momento da sessão;
- início da sessão;
- fim da sessão;
- períodos efetivamente executados;
- duração total.

Os snapshots de títulos permanecem disponíveis mesmo se a tarefa ou a lista forem editadas ou removidas do Google Tasks.

O MVP deve permitir visualizar:

- sessões concluídas, da mais recente para a mais antiga;
- tarefa, lista, horário e duração de cada sessão;
- tempo total efetivamente registrado hoje.

Editar ou excluir registros históricos fica fora do MVP. O cancelamento da sessão ativa cobre o caso simples de um timer iniciado por engano.

### 4.8 Total do dia

O total do dia representa o tempo efetivamente executado dentro do dia civil atual no fuso local do navegador.

- Incluir períodos de sessões concluídas que interceptem o dia atual.
- Incluir o período transcorrido da sessão ativa quando ela estiver em execução.
- Excluir intervalos pausados.
- Quando uma sessão atravessar a meia-noite, atribuir a cada dia apenas a parcela que realmente ocorreu nele, sem dividir o registro histórico.
- Recalcular o total quando o dia local mudar ou quando o popup for reaberto.
- Uma mudança de fuso horário não altera durações já registradas; ela altera apenas apresentação e quais parcelas pertencem ao novo dia local.

## 5. Interface

A interface principal é o popup da extensão e deve permanecer pequena, rápida e focada.

A interface inicial é em português do Brasil.

O MVP contém:

- estado de conexão com Google;
- lista priorizada de tarefas;
- identificação da tarefa e da lista;
- ações para iniciar, pausar, retomar, finalizar e cancelar;
- timer ativo;
- total registrado hoje;
- histórico básico;
- estados de carregamento, vazio, indisponibilidade e erro recuperável.

Requisitos:

- usar HTML semântico, rótulos acessíveis, foco visível e navegação por teclado;
- não depender apenas de cor para comunicar estado;
- desabilitar ações impossíveis com explicação curta;
- apresentar mensagens em linguagem de produto, sem tokens, respostas REST, stack traces ou detalhes de implementação;
- manter histórico e sessão ativa acessíveis quando a integração Google estiver temporariamente indisponível.

## 6. Dados, privacidade e retenção

O Google Tasks é a fonte de verdade para tarefas. O Pacebit é a fonte de verdade apenas para:

- sessão ativa;
- histórico de sessões.

Os dados próprios ficam no armazenamento local da extensão, associados ao perfil atual do Chrome:

- não são enviados a servidores do Pacebit;
- não são sincronizados entre dispositivos;
- não são compartilhados entre perfis;
- permanecem até a remoção da extensão, limpeza dos dados da extensão ou futura funcionalidade explícita de exclusão;
- não ficam disponíveis em modo anônimo no MVP.

Usar a área `local` do WXT Storage. Não usar `storage.session`, porque seus dados são apagados em reinícios, recargas e atualizações da extensão. Não solicitar `unlimitedStorage` no MVP; manter os registros compactos e tratar falhas de quota explicitamente.

Não armazenar tokens OAuth em mecanismo próprio quando a API de identidade puder gerenciá-los. Não persistir respostas completas da Google Tasks API como cache.

## 7. Comportamento em falhas

- **Sem conexão ou API indisponível:** manter sessão e histórico locais utilizáveis; bloquear apenas carregamento e mutações remotas.
- **Autenticação expirada ou revogada:** solicitar nova autenticação de forma contextualizada.
- **Falha ao carregar uma lista:** informar que os dados podem estar incompletos e permitir nova tentativa; não apresentar resultado parcial como completo.
- **Falha de persistência:** preservar o estado recuperável existente e não declarar a ação concluída.
- **Conflito entre contextos:** recarregar o estado persistido e informar quando uma ação não puder ser aplicada porque outra instância já alterou a sessão.
- **Tarefa ausente ou alterada:** usar snapshots apenas para histórico; nunca sobrescrever silenciosamente a versão atual do Google Tasks.

Fallbacks genéricos não podem ocultar erros conhecidos nem apagar dados locais válidos.

## 8. Direção técnica

Stack base:

- WXT;
- Chrome Manifest V3;
- React;
- TypeScript estrito;
- pnpm;
- Biome;
- Vitest;
- Testing Library;
- Playwright;
- GitHub Actions.

Diretrizes:

- usar entrypoints nativos do WXT;
- usar WXT Storage para dados persistentes conhecidos;
- usar a API `chrome.identity` para autenticação;
- consumir a Google Tasks API via REST enquanto um SDK não oferecer benefício demonstrado;
- usar background somente para responsabilidades de ciclo de vida ou APIs que realmente exijam esse contexto;
- não usar content scripts nem manipular o DOM do Google Tasks;
- separar interface, integração Google, domínio do timer e persistência;
- manter o estado importante reconstruível a partir da persistência;
- declarar somente as permissões de extensão `identity` e `storage`;
- declarar somente a host permission `https://tasks.googleapis.com/*` para chamadas REST;
- declarar somente o scope OAuth `https://www.googleapis.com/auth/tasks`.

O `AGENTS.md` contém as regras operacionais e de engenharia. Este documento contém as decisões de produto e os limites arquiteturais que a implementação deve cumprir.

## 9. Distribuição e OAuth

Antes de uma distribuição pública:

- usar um projeto Google Cloud próprio do Pacebit com a Google Tasks API habilitada;
- criar uma credencial OAuth para extensão Chrome compatível com o ID estável da extensão distribuída;
- configurar marca, audiência, tela de consentimento e o scope efetivamente usado;
- publicar política de privacidade coerente com o processamento local descrito neste documento;
- concluir as verificações OAuth e da Chrome Web Store aplicáveis;
- demonstrar no material de revisão por que o acesso de escrita é necessário e que a única mutação realizada é concluir uma tarefa por ação explícita.

O client ID OAuth identifica a extensão e não é segredo. Nunca incorporar um client secret ao bundle. Projetos, IDs e ambientes de desenvolvimento e produção devem permanecer separados quando isso for necessário para testes e publicação.

Para o primeiro lançamento, a ampliação dos fluxos E2E e a bateria manual de resiliência
descritas nas seções 8.1 e 8.2 da especificação são trabalho pós-lançamento e não bloqueiam a
submissão. Essa decisão não remove as garantias funcionais já implementadas nem dispensa os testes
automatizados existentes, a auditoria de segurança ou a instalação e o smoke do pacote candidato
em perfil limpo definidos na seção 9.3 da especificação. Permanece como risco residual a validação
ampliada de reinício e atualização do Chrome e dos cenários integrados de falha.

## 10. Critérios de aceite do MVP

O MVP estará funcionalmente completo quando for demonstrado que:

1. o usuário autentica por ação explícita e vê suas tarefas elegíveis de todas as listas;
2. resultados paginados são carregados sem truncamento silencioso;
3. tarefas vencidas e de hoje aparecem com a prioridade definida;
4. somente uma sessão pode estar ativa;
5. pausa, retomada, finalização e cancelamento seguem a tabela de transições;
6. fechar e reabrir o popup ou recriar seus contextos não altera a duração correta; a bateria manual ampliada de reinício do Chrome e atualização da extensão fica registrada como pós-lançamento;
7. finalizar cria exatamente um registro histórico antes de limpar a sessão ativa;
8. o total de hoje considera somente o tempo executado no dia local, inclusive em sessões que cruzam a meia-noite;
9. uma sessão ativa e o histórico continuam utilizáveis sem acesso temporário ao Google;
10. concluir uma tarefa exige ação explícita, usa `PATCH` com apenas os campos de conclusão e falhas remotas não afetam o histórico local;
11. estados vazios, de carregamento, autenticação e falha são compreensíveis e recuperáveis;
12. duas instâncias do popup não conseguem criar sessões ativas ou finalizações duplicadas;
13. nenhuma tarefa ou sessão é enviada a servidores próprios ou sincronizada entre dispositivos;
14. manifesto, consentimento OAuth e política de privacidade declaram somente os acessos realmente usados;
15. a conclusão de uma tarefa recorrente conhecida foi verificada com conta de teste e qualquer limitação da API foi documentada sem afetar o histórico local.

## 11. Fora do escopo do MVP

Não implementar:

- Google Calendar;
- Pomodoro ou métodos de foco customizados;
- notificações ou uso de `chrome.alarms`;
- projetos, tags ou tarefas próprias;
- criação, edição de conteúdo, reorganização ou exclusão de Google Tasks;
- seletor de múltiplas contas Google;
- edição ou exclusão do histórico;
- relatórios avançados, gráficos, exportação ou metas;
- backend, banco de dados ou conta própria;
- backup, sincronização em nuvem ou entre dispositivos;
- colaboração ou equipes;
- inteligência artificial;
- integrações com outros gerenciadores de tarefas;
- content scripts ou manipulação do DOM do Google Tasks;
- modo anônimo;
- telemetria, analytics de produto, billing ou assinaturas.

Esses recursos somente podem entrar após alteração explícita deste documento.

## 12. Evoluções futuras possíveis

Depois de validar o fluxo principal, podem ser consideradas:

1. correção ou exclusão de registros históricos;
2. notificações e alarmes;
3. Pomodoro e métodos de foco configuráveis;
4. estatísticas, gráficos e exportação;
5. backup ou sincronização entre dispositivos;
6. suporte a outras plataformas ou integrações;
7. recursos pagos.

Possibilidades futuras não devem influenciar a arquitetura do MVP sem necessidade concreta para evitar uma limitação técnica evidente.

## 13. Decisões registradas

1. Suportar inicialmente somente Google Chrome com Manifest V3.
2. Manter Google Tasks como fonte de verdade para tarefas e Pacebit como fonte de verdade para sessões locais.
3. Ler tarefas próprias não concluídas de todas as listas e não incluir tarefas atribuídas no MVP.
4. Permitir somente uma sessão ativa e reconstruir toda duração a partir de dados persistidos.
5. Persistir períodos de execução para calcular pausas e interseções com o dia local corretamente.
6. Usar armazenamento local sem sincronização, backend ou permissão `unlimitedStorage`.
7. Solicitar o scope completo de Google Tasks somente porque a API não oferece permissão mais estreita para concluir tarefas.
8. Alterar tarefas remotas apenas por `PATCH` dos campos mínimos de conclusão, após ação explícita.
9. Não exigir background service worker nem mensageria enquanto módulos compartilhados e persistência resolverem o fluxo com segurança.
10. Não criar content scripts, manipular o DOM do Google Tasks nem antecipar integrações futuras.
11. Cancelar uma sessão ativa é uma ação direta, sem confirmação adicional, e nunca cria histórico.
12. Tratar as SPECs 8.1 e 8.2 como pós-lançamento e não bloqueantes para a primeira submissão, preservando a regressão automatizada existente, a auditoria de segurança e o smoke do pacote candidato.

## 14. Referências técnicas

- [Google Tasks API — visão geral REST](https://developers.google.com/workspace/tasks/reference/rest)
- [Google Tasks API — `tasks.list`](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list)
- [Google Tasks API — `tasklists.list`](https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists/list)
- [Google Tasks API — recurso `Task`](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks)
- [Google Tasks API — `tasks.patch`](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/patch)
- [Google Tasks API — documento de descoberta](https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest)
- [Google Tasks API — scopes OAuth](https://developers.google.com/workspace/tasks/auth)
- [Google Workspace — consentimento OAuth](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Chrome Extensions — Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [Chrome Extensions — Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome Extensions — requisições entre origens](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Chrome Extensions — ciclo de vida de service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome Extensions — práticas de segurança](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
- [Chrome Extensions — código hospedado remotamente](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
- [Chrome Web Store — dados do usuário](https://developer.chrome.com/docs/webstore/user_data)
- [WXT — entrypoints](https://wxt.dev/guide/essentials/entrypoints)
- [WXT — storage](https://wxt.dev/storage)

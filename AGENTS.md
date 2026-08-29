# AGENTS.md

Regras globais para qualquer pessoa ou agente que trabalhe neste repositório.

## Fonte de verdade

- Leia `docs/SCOPE.md` por completo antes de alterar comportamento, arquitetura ou dependências.
- O pedido atual do usuário tem precedência quando altera explicitamente uma decisão.
- `docs/SCOPE.md` é a fonte de verdade para produto, comportamento, limites do MVP e arquitetura.
- Este arquivo é a fonte de verdade para processo de trabalho e regras de engenharia.
- `docs/SPEC.md` é o plano executável e registro de progresso; não pode alterar o escopo por conta própria.
- Em conflito dentro do mesmo domínio, siga: pedido atual explícito, `docs/SCOPE.md`, este arquivo, `docs/SPEC.md`.
- Não amplie o MVP sem registrar a decisão em `docs/SCOPE.md`.
- Não marque trabalho como concluído sem implementação e verificação correspondentes.

## Objetivo do projeto

O Pacebit é uma extensão Chrome Manifest V3 que mede o tempo gasto em tarefas do Google Tasks.

O Google Tasks organiza as tarefas. O Pacebit mantém apenas a execução temporal, a sessão ativa e o histórico local necessários ao fluxo definido no escopo.

## Princípios de engenharia

- Prefira a menor solução correta, legível e testável.
- Crie abstrações para uma fronteira externa clara ou após duas utilizações reais.
- Não antecipe funcionalidades futuras nem prepare arquitetura para elas sem necessidade atual demonstrada.
- Não adicione dependências quando APIs da plataforma ou do WXT resolverem o problema com qualidade semelhante.
- Evite arquivos ou diretórios genéricos chamados `utils`, `helpers`, `common` ou `services`.
- Nomeie módulos e funções pela responsabilidade concreta.
- Mantenha efeitos externos nas bordas e regras de domínio determinísticas no núcleo.
- Não introduza Redux, Zustand, Jotai, Zod ou bibliotecas equivalentes sem decisão registrada no escopo.
- Preserve alterações existentes do usuário e não reformate ou reestruture código alheio à tarefa.

## Arquitetura obrigatória

- Use WXT.
- Use Chrome Manifest V3.
- Use TypeScript estrito.
- Use React no popup.
- Use WXT Storage para persistência da extensão.
- Use um background entrypoint somente quando uma responsabilidade depender de seu ciclo de vida ou contexto.
- Não crie content scripts no MVP.
- Não manipule o DOM do Google Tasks.
- Não crie backend, banco de dados ou comunicação com servidores próprios.
- Mantenha a integração Google, o domínio do timer, a persistência e a interface como responsabilidades separadas.
- Mantenha Google Tasks como fonte de verdade para tarefas e o armazenamento local como fonte de verdade para sessões.

Não crie camadas ou interfaces genéricas para múltiplos provedores antes de existir um segundo provedor aprovado.

## Convenções WXT

- Use entrypoints nativos do WXT.
- Não execute APIs do navegador durante inicialização de módulo quando a ação pertencer ao ciclo de vida de um entrypoint.
- Execute listeners e inicializações do background dentro de `defineBackground`.
- Use `storage.defineItem` para itens persistentes conhecidos.
- Use `watch` somente quando reatividade entre contextos for realmente necessária.
- Use chaves da área `local:` para sessão ativa e histórico; não use `session:` para dados que devem sobreviver ao reinício do Chrome.
- Não crie wrapper genérico sobre WXT Storage.
- Configure em `wxt.config.ts` o client ID OAuth, o scope aprovado, as permissões `identity` e `storage` e a host permission `https://tasks.googleapis.com/*`; não acrescente outro acesso privilegiado sem decisão registrada.
- Solicite apenas permissões necessárias ao comportamento atual do MVP.
- Não adicione permissões preventivamente.

## Integração Google

- Use `chrome.identity` para o fluxo OAuth e cache de tokens.
- Dispare autenticação interativa somente a partir de ação explícita e contextualizada do usuário.
- Não armazene tokens em mecanismo próprio.
- Centralize chamadas REST à Google Tasks API em módulos nomeados pela operação ou recurso concreto.
- Implemente paginação de listas e tarefas consumindo cada `nextPageToken`; não trate a primeira página como resultado completo.
- Envie `showCompleted=false`, `showDeleted=false`, `showHidden=false` e `showAssigned=false` explicitamente.
- Não persista respostas completas da API nem crie sincronização bidirecional.
- Use o token OAuth como credencial das chamadas REST; não adicione API key nem carregue o cliente JavaScript remoto do Google.
- O client ID OAuth pode constar no manifesto; nunca adicione client secret ao código, configuração versionada ou bundle.
- Use o scope `https://www.googleapis.com/auth/tasks` somente para leitura e para a conclusão explícita de uma tarefa.
- Não use o acesso de escrita para criar, editar conteúdo, mover, reorganizar ou excluir tarefas.
- Para concluir, use `tasks.patch` com `status: "completed"` e somente outro campo de conclusão que o contrato real demonstrar necessário; não use `tasks.update` nem envie campos que o Pacebit não pretende modificar.
- Use resposta parcial com `fields` quando isso reduzir dados sem complicar o fluxo; solicite apenas os campos usados pelo produto e preserve `nextPageToken`.
- Trate token ausente, expirado ou revogado e erros de rede, autorização, limite e resposta inválida.
- Ao receber token inválido, remova-o do cache da Identity API antes de tentar obter outro; não mantenha cache paralelo.
- Não exponha ao usuário tokens, URLs internas, payloads REST ou detalhes de autenticação.
- Testes comuns não podem depender de chamadas reais à Google API.

Integração e persistência local são independentes: uma falha remota não pode apagar nem invalidar uma sessão já salva.

## Domínio do timer

- Modele apenas os estados persistentes definidos em `docs/SCOPE.md`: sem sessão, em execução e pausado.
- Trate iniciar, pausar, retomar, finalizar e cancelar como transições determinísticas.
- Apenas uma sessão ativa pode existir por vez.
- O timer nunca depende de contador em memória como fonte de verdade.
- Persista timestamps, snapshots e períodos de execução suficientes para reconstrução e cálculo diário.
- Use `setInterval` somente para atualizar a apresentação.
- Mantenha cálculos de duração, interseção com o dia local e transições fora dos componentes React.
- Faça finalização e demais transições resistentes a ações repetidas, sem duplicar períodos ou histórico.
- Salve o registro concluído antes de remover a sessão ativa.
- Preserve a sessão ativa quando uma transição que depende de persistência falhar.
- Não exija Google Tasks disponível para recuperar, pausar, retomar, finalizar ou cancelar uma sessão local.
- Faça instâncias concorrentes convergirem pelo estado persistido e rejeite transições baseadas em estado obsoleto.
- Não permita que atualizações concorrentes criem duas sessões ativas, percam uma transição confirmada ou dupliquem histórico.

Mudanças de fuso horário e passagem da meia-noite devem produzir resultados determinísticos de acordo com as definições do escopo e possuir testes específicos.

## Persistência

Persistir somente:

- sessão ativa;
- histórico de sessões.

Regras:

- snapshots contêm apenas o contexto mínimo definido no escopo;
- registros históricos possuem identificador único e não dependem da tarefa remota continuar existindo;
- dados temporais usam representação não ambígua e são convertidos para o fuso local somente nas bordas apropriadas;
- leitura de dados ausentes deve produzir estado inicial válido;
- dados inválidos ou incompatíveis não devem ser silenciosamente tratados como válidos;
- falha de escrita não pode ser apresentada como sucesso;
- use o versionamento e as migrações nativas de `storage.defineItem` somente quando uma mudança real de schema exigir;
- não crie sistema próprio e genérico de repositórios, migrações ou cache.

Preferências somente podem ser persistidas quando existir requisito aprovado.

## React

- Componentes React são responsáveis por apresentação e interação.
- Componentes podem manter estado local e transitório da interface.
- Componentes não implementam OAuth, REST, persistência ou regras de cálculo do timer.
- Componentes recebem dados e ações por interfaces pequenas e concretas.
- Efeitos devem possuir dependências corretas, limpeza quando aplicável e comportamento seguro sob remontagem.
- Não introduza biblioteca de estado global sem necessidade demonstrada.

Hooks podem coordenar o caso de uso da interface, mas não devem se tornar local oculto para regras de domínio ou integração.

## Background

- Mantenha o background pequeno.
- Use-o somente para responsabilidades que realmente dependam desse contexto.
- Não envie toda ação do popup ao background apenas por ele existir.
- Não mantenha estado importante apenas em memória no background.
- O background deve reconstruir qualquer estado necessário a partir da persistência.
- Não crie mensageria interna até existir necessidade concreta entre contextos.
- Não use alarmes, notificações ou execução periódica no MVP.

Concorrência entre instâncias é uma necessidade concreta, mas não torna o background obrigatório: primeiro avalie coordenação pela persistência e por APIs nativas adequadas. Introduza um único escritor ou mensageria apenas se a solução mais simples não preservar as invariantes do timer.

## Interface

- A interface inicial é em português do Brasil.
- Use HTML semântico, rótulos acessíveis, foco visível e navegação por teclado.
- Não dependa apenas de cor para comunicar estado.
- Use CSS comum e custom properties para tokens visuais.
- Não use Tailwind nem biblioteca de componentes no MVP sem decisão registrada.
- Recursos indisponíveis ficam ocultos ou desabilitados com explicação curta.
- Diferencie carregamento, vazio, offline, autenticação necessária e erro recuperável.
- Mensagens ao usuário não expõem exceções, tokens, detalhes REST ou informações internas.

## Segurança e privacidade

- Solicite somente permissões e scopes necessários.
- Não leia dados além dos necessários ao comportamento definido.
- Não envie tarefas, listas, histórico, identificadores ou telemetria para servidores próprios ou terceiros.
- Não use código remoto nem `eval`.
- Não adicione `tabs`, `activeTab`, `scripting`, `unlimitedStorage`, acesso anônimo ou host permissions além de `https://tasks.googleapis.com/*`.
- Não registre tokens, respostas completas da API ou dados pessoais em logs.
- Não use conteúdo remoto para executar código.
- Considere títulos de tarefas e listas como dados do usuário; apresente-os como texto, nunca como HTML confiável.

## Qualidade

Todo código novo deve passar por TypeScript estrito, Biome e testes proporcionais ao risco.

### Testes de domínio

Teste, no mínimo:

- todas as transições válidas do timer;
- ações repetidas e transições inválidas;
- cálculo de duração com múltiplas pausas;
- recuperação de cada estado persistente;
- finalização sem duplicidade;
- falha de persistência durante finalização;
- cancelamento;
- mudança de dia e sessões que atravessam a meia-noite;
- total diário com sessão ativa, pausada e concluída;
- mudanças de fuso horário nos limites definidos pelo produto.

### Testes de integração

- Teste autenticação e Google Tasks por adaptadores controlados, sem chamadas reais nos testes comuns.
- Teste paginação de listas e tarefas, filtros explícitos, listas vazias, resposta parcial, subtarefa, ocorrência recorrente, tarefa ausente, token inválido, falhas HTTP e rede.
- Teste que concluir tarefa e salvar histórico permanecem operações independentes.
- Teste que a conclusão usa `PATCH` e não envia campos alheios ao estado de conclusão.
- Teste transições concorrentes a partir de estado obsoleto e sincronização entre instâncias.
- Use Testing Library para comportamentos observáveis relevantes do popup.
- Use Playwright para fluxos críticos da extensão carregada no Chromium com integração controlada.
- Antes de considerar OAuth e Google Tasks prontos para distribuição, execute um smoke test documentado com conta de teste real.
- Inclua nesse smoke uma tarefa recorrente conhecida, pois a regra de recorrência não aparece no recurso público `Task`.
- Antes da distribuição pública, verifique projeto Google Cloud, credencial vinculada ao ID da extensão, consentimento, política de privacidade e revisões aplicáveis.

Não considere uma integração pronta apenas porque funciona no ambiente unitário.

## Fluxo de trabalho

1. Leia `docs/SCOPE.md` e `docs/SPEC.md`.
2. Identifique a próxima tarefa não concluída cujas dependências estejam satisfeitas.
3. Confirme critérios de aceite e arquivos afetados.
4. Faça a menor alteração completa que entregue a tarefa.
5. Execute typecheck, lint e testes relevantes.
6. Revise o diff e confirme que não houve expansão de escopo.
7. Marque `[x]` somente após implementação e verificação correspondentes.
8. Registre no checklist qualquer trabalho novo descoberto.

## Comandos esperados

Após o scaffold, o `package.json` deve expor comandos equivalentes a:

- `pnpm dev` — desenvolvimento da extensão;
- `pnpm build` — build de produção;
- `pnpm typecheck` — validação TypeScript;
- `pnpm lint` — lint e formatação verificada;
- `pnpm format` — formatação automática;
- `pnpm test` — testes unitários;
- `pnpm test:watch` — testes em modo watch;
- `pnpm test:e2e` — testes no Chromium;
- `pnpm check` — typecheck, lint e testes unitários.

Se os nomes mudarem após a criação da especificação, atualize este arquivo e `docs/SPEC.md` no mesmo trabalho.

## Definição de pronto

Uma tarefa está pronta somente quando:

- o comportamento solicitado está implementado;
- os casos de ausência e falha relevantes foram tratados;
- testes apropriados foram adicionados ou atualizados;
- os comandos de validação aplicáveis passaram;
- o fluxo crítico afetado foi verificado no nível adequado;
- documentação e checklist refletem o estado real;
- não existem erros conhecidos ocultados por fallback genérico;
- não houve expansão não documentada do MVP;
- o diff contém apenas mudanças relacionadas ao trabalho.

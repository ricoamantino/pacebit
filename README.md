# Pacebit

Pacebit é uma extensão Chrome Manifest V3 para registrar o tempo efetivamente dedicado às tarefas
do Google Tasks. O Google Tasks continua responsável por criar e organizar tarefas; o Pacebit
mantém apenas a sessão ativa e o histórico local necessários para medir a execução.

O projeto é distribuído sob a [licença MIT](LICENSE). As decisões de produto estão no
[`docs/SCOPE.md`](docs/SCOPE.md), e o progresso executável está no
[`docs/SPEC.md`](docs/SPEC.md).

## Jornada principal

1. Conecte a conta Google associada ao perfil atual do Chrome.
2. Escolha uma tarefa carregada de qualquer lista elegível.
3. Inicie, pause e retome a sessão quando necessário.
4. Finalize para salvar o tempo no histórico e no total do dia.
5. Opcionalmente, conclua a tarefa no Google Tasks por uma ação separada.

Uma sessão recuperada pode ser pausada, retomada, finalizada ou cancelada mesmo quando o Google
estiver temporariamente indisponível.

## Requisitos

- Google Chrome 106 ou mais recente;
- Node.js 22.22.2 ou mais recente;
- pnpm 10.28.2;
- projeto Google Cloud com a Google Tasks API habilitada;
- cliente OAuth do tipo **Extensão do Chrome** associado ao ID estável
  `jkpogflkipedlninnnplenlajoofkkfp`.

## Instalação para desenvolvimento

```sh
git clone https://github.com/ricoamantino/pacebit.git
cd pacebit
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Preencha `WXT_GOOGLE_OAUTH_CLIENT_ID` em `.env.local` com o client ID do seu ambiente. O client ID
identifica publicamente a extensão, mas o arquivo local permanece fora do Git para separar
ambientes. O Pacebit não usa client secret nem API key.

Para iniciar o WXT:

```sh
pnpm dev
```

Abra `chrome://extensions`, habilite o **Modo do desenvolvedor**, escolha **Carregar sem compactação**
e selecione o diretório de desenvolvimento informado pelo WXT. Para testar exatamente o build de
produção, execute `pnpm build` e carregue `.output/chrome-mv3`.

## Configuração do Google Cloud

1. Crie ou selecione um projeto exclusivo do Pacebit.
2. Em **APIs e serviços**, habilite a **Google Tasks API**.
3. No Google Auth Platform, configure:
   - Branding com o nome `Pacebit`, ícone próprio e e-mails de suporte e contato;
   - Audience como `External`; durante desenvolvimento, mantenha `Testing` e adicione as contas de
     teste autorizadas;
   - Data Access somente com `https://www.googleapis.com/auth/tasks`.
4. Crie um cliente OAuth do tipo **Extensão do Chrome** usando o ID
   `jkpogflkipedlninnnplenlajoofkkfp`.
5. Copie apenas o client ID para `.env.local`.

O scope completo é necessário porque a API não oferece um scope mais estreito para conclusão. O
Pacebit o utiliza somente para ler listas e tarefas e para enviar `status: "completed"` depois de
uma ação explícita. Não cria, edita, move ou exclui tarefas.

Para OAuth de produção, o Google exige homepage, política de privacidade e termos em domínio
público verificável. O site institucional foi preparado para
[pacebit.produtivo.dev](https://pacebit.produtivo.dev/), com
[política pública](https://pacebit.produtivo.dev/privacy) e
[termos públicos](https://pacebit.produtivo.dev/terms). Os demais textos de revisão estão em
[`docs/SUBMISSION.md`](docs/SUBMISSION.md); esses materiais não representam aprovação do Google.

### Ambientes OAuth

| Ambiente | Configuração |
| --- | --- |
| Desenvolvimento | `.env.local`, ignorado pelo Git, com o client ID do ambiente |
| Testes | `.env.test`, rastreável, com identificador sintático e não funcional |
| CI/distribuição | variável pública `WXT_GOOGLE_OAUTH_CLIENT_ID` no GitHub Actions |

Tokens são obtidos e renovados pelo `chrome.identity`; nunca são gravados pelo Pacebit.

## Scripts

| Comando | Responsabilidade |
| --- | --- |
| `pnpm dev` | Inicia o WXT em modo de desenvolvimento |
| `pnpm build` | Gera a extensão de produção em `.output/chrome-mv3` |
| `pnpm zip` | Gera o ZIP Chrome pelo WXT |
| `pnpm typecheck` | Prepara tipos WXT e executa TypeScript sem emissão |
| `pnpm lint` | Verifica lint e formatação com Biome |
| `pnpm format` | Formata arquivos com Biome |
| `pnpm test` | Executa os testes Vitest uma vez |
| `pnpm test:watch` | Executa Vitest em modo interativo |
| `pnpm test:e2e` | Gera o build de teste e executa Playwright no Chromium |
| `pnpm check` | Executa typecheck, lint e testes unitários |
| `pnpm postinstall` | Prepara os tipos gerados pelo WXT após a instalação |

## Testes e smokes

```sh
pnpm check
pnpm test:e2e
pnpm build
pnpm audit --prod
```

Testes comuns usam adaptadores controlados, dados sintéticos e um client ID não funcional. Eles
não acessam uma conta Google real. Antes de uma submissão, os smokes manuais devem usar uma conta de
teste e comprovar separadamente uma tarefa comum e uma ocorrência recorrente. Nunca registre token,
credencial ou conteúdo pessoal nas evidências.

## Arquitetura e dados

```text
Popup React ── chrome.identity ── Google OAuth
     │
     ├── REST HTTPS ───────────── Google Tasks API
     │
     ├── domínio puro ─────────── transições e cálculos do timer
     │
     └── WXT Storage local ────── sessão ativa e histórico
```

- O popup coordena apresentação e ações transitórias.
- `src/google` contém autorização, transporte REST e paginação.
- `src/timer` contém estados, transições e cálculos determinísticos.
- `src/storage` valida e coordena as duas coleções persistentes.
- Tarefas e listas ficam somente em memória durante o popup.
- Sessão ativa e histórico ficam no `storage.local` do perfil atual do Chrome.
- Não existe backend, banco de dados, telemetria, analytics ou sincronização entre dispositivos.

Consulte a [política de privacidade](docs/PRIVACY.md) para a descrição completa dos dados e os
[termos de uso](docs/TERMS.md) para as condições do software.

## Limitações conhecidas

- somente Google Chrome e interface em português do Brasil;
- somente uma sessão ativa por perfil;
- sem edição ou exclusão individual do histórico no MVP;
- sem backup ou sincronização entre dispositivos ou perfis;
- sem notificações, Pomodoro, relatórios avançados ou integração com outros serviços;
- a API pública não expõe a regra de recorrência; o Pacebit trata cada ocorrência retornada como
  uma tarefa comum;
- os fluxos E2E ampliados e a bateria manual de resiliência das SPECs 8.1 e 8.2 permanecem no
  backlog pós-lançamento;
- a verificação OAuth de produção ainda depende da publicação efetiva do site, verificação do
  domínio e vídeo de demonstração aceito pelo Google.

## Documentação

- [Site institucional](https://pacebit.produtivo.dev/)
- [Política de privacidade pública](https://pacebit.produtivo.dev/privacy)
- [Termos de uso públicos](https://pacebit.produtivo.dev/terms)
- [Escopo do produto](docs/SCOPE.md)
- [Especificação executável](docs/SPEC.md)
- [Política de privacidade](docs/PRIVACY.md)
- [Termos de uso](docs/TERMS.md)
- [Materiais de submissão](docs/SUBMISSION.md)
- [Regras de contribuição](AGENTS.md)

import type { ReactNode } from 'react';
import type { CivilDate } from '../../src/tasks/scheduled-date';
import type { PrioritizedGoogleTask, TaskPriorityGroup } from '../../src/tasks/task-priority';
import {
  type PopupDependencies,
  type PopupGoogleState,
  type PopupLocalState,
  usePopupController,
} from './usePopupController';

interface AppProps {
  readonly dependencies?: PopupDependencies;
}

export function App({ dependencies }: AppProps) {
  const controller = usePopupController(dependencies);

  return (
    <main className="popup-shell">
      <header className="app-header">
        <img className="app-icon" src="/icon-32.png" alt="" width="32" height="32" />
        <div>
          <h1>Pacebit</h1>
          <p>Acompanhe o tempo dedicado às suas tarefas.</p>
        </div>
      </header>

      <CurrentSession state={controller.local} />
      <GoogleStatus
        state={controller.google}
        taskCount={controller.taskCount}
        prioritizedTasks={controller.prioritizedTasks}
        onConnect={controller.connectGoogle}
        onRetry={controller.retryGoogle}
      />
      <LocalTotals state={controller.local} />
    </main>
  );
}

interface GoogleStatusProps {
  readonly state: PopupGoogleState;
  readonly taskCount: number;
  readonly prioritizedTasks: readonly PrioritizedGoogleTask[];
  readonly onConnect: () => void;
  readonly onRetry: () => void;
}

function GoogleStatus({
  state,
  taskCount,
  prioritizedTasks,
  onConnect,
  onRetry,
}: GoogleStatusProps) {
  const content = getGoogleStatusContent(state, taskCount);

  return (
    <div className="google-regions">
      <section className="card integration-card" aria-labelledby="connection-heading">
        <div className="section-heading-row">
          <h2 id="connection-heading">Conexão Google</h2>
          <span className={`status-label status-label--${connectionTone(state.status)}`}>
            {connectionLabel(state.status)}
          </span>
        </div>

        <div className="status-message" aria-live="polite" aria-atomic="true">
          <p>{connectionMessage(state.status)}</p>
          {state.status === 'disconnected' ? (
            <p className="status-detail">
              O acesso é usado somente para ler tarefas e concluir uma tarefa quando você pedir.
            </p>
          ) : null}
        </div>

        {state.status === 'disconnected' ? (
          <button className="primary-button" type="button" onClick={onConnect}>
            Conectar com Google
          </button>
        ) : null}

        {state.status === 'connecting' ? (
          <button className="primary-button" type="button" disabled>
            Conectando…
          </button>
        ) : null}
      </section>

      <section
        className="card integration-card"
        aria-labelledby="tasks-heading"
        aria-busy={state.status === 'loading'}
      >
        <div className="section-heading-row">
          <h2 id="tasks-heading">Tarefas</h2>
          <span className={`status-label status-label--${content.tone}`}>{content.label}</span>
        </div>

        <div className="status-message" aria-live="polite" aria-atomic="true">
          <p>{content.message}</p>
          {content.detail ? <p className="status-detail">{content.detail}</p> : null}
        </div>

        {prioritizedTasks.length > 0 ? <TaskGroups tasks={prioritizedTasks} /> : null}

        {state.status === 'loading' ? (
          <p className="loading-detail" role="status">
            Outras listas ou páginas ainda estão sendo carregadas.
          </p>
        ) : null}

        {isRetryableState(state.status) ? (
          <button className="secondary-button" type="button" onClick={onRetry}>
            {state.status === 'ready' ? 'Atualizar tarefas' : 'Tentar novamente'}
          </button>
        ) : null}

        {state.status === 'loading' && taskCount > 0 ? (
          <button className="secondary-button" type="button" disabled>
            Atualizando…
          </button>
        ) : null}
      </section>
    </div>
  );
}

function CurrentSession({ state }: { readonly state: PopupLocalState }) {
  const summary = state.status === 'loading' ? undefined : state.value;
  const unavailable = state.status === 'error';

  return (
    <section className="local-overview" aria-labelledby="session-overview-heading">
      <div className="local-heading-row">
        <h2 id="session-overview-heading">Seu tempo</h2>
        {unavailable ? (
          <p className="local-warning" role="status">
            Não foi possível atualizar os dados locais.
          </p>
        ) : null}
      </div>

      <SummaryCard title="Sessão atual">
        {state.status === 'loading' ? (
          <p>Carregando dados locais…</p>
        ) : summary?.activeSession ? (
          <>
            <p className="summary-value">{formatDuration(summary.activeDurationMs)}</p>
            <p className="summary-title">{summary.activeSession.task.title || 'Sem título'}</p>
            <p className="summary-detail">
              {summary.activeSession.taskList.title || 'Lista sem título'} ·{' '}
              {summary.activeSession.state === 'running' ? 'Em execução' : 'Pausada'}
            </p>
          </>
        ) : (
          <p>{unavailable ? 'Dados locais indisponíveis.' : 'Nenhuma sessão em andamento.'}</p>
        )}
      </SummaryCard>
    </section>
  );
}

function LocalTotals({ state }: { readonly state: PopupLocalState }) {
  const summary = state.status === 'loading' ? undefined : state.value;

  return (
    <section className="local-overview" aria-labelledby="totals-heading">
      <h2 id="totals-heading">Resumo local</h2>
      <div className="summary-grid">
        <SummaryCard title="Total de hoje">
          <p className="summary-value">{summary ? formatDuration(summary.dailyTotalMs) : '—'}</p>
          <p className="summary-detail">Tempo efetivamente registrado.</p>
        </SummaryCard>

        <SummaryCard title="Histórico">
          <p className="summary-value">{summary ? summary.historyCount : '—'}</p>
          <p className="summary-detail">
            {summary
              ? summary.historyCount === 1
                ? 'sessão concluída neste perfil'
                : 'sessões concluídas neste perfil'
              : 'Resumo local indisponível.'}
          </p>
        </SummaryCard>
      </div>
    </section>
  );
}

const taskGroups: readonly { readonly id: TaskPriorityGroup; readonly title: string }[] = [
  { id: 'overdue', title: 'Vencidas' },
  { id: 'today', title: 'Hoje' },
  { id: 'undated', title: 'Sem data' },
  { id: 'future', title: 'Futuras' },
];

function TaskGroups({ tasks }: { readonly tasks: readonly PrioritizedGoogleTask[] }) {
  return (
    <div className="task-groups">
      {taskGroups.map((group) => {
        const groupTasks = tasks.filter((task) => task.group === group.id);

        return groupTasks.length > 0 ? (
          <section className="task-group" aria-labelledby={`task-group-${group.id}`} key={group.id}>
            <h3 id={`task-group-${group.id}`}>{group.title}</h3>
            <ul className="task-list">
              {groupTasks.map((item) => (
                <TaskItem item={item} key={`${item.taskList.id}:${item.task.id}`} />
              ))}
            </ul>
          </section>
        ) : null;
      })}
    </div>
  );
}

function TaskItem({ item }: { readonly item: PrioritizedGoogleTask }) {
  return (
    <li className="task-item">
      <p className="task-title">{item.task.title || 'Sem título'}</p>
      <p className="task-context">
        <span>{item.taskList.title || 'Lista sem título'}</span>
        {item.task.parentId ? <span className="task-kind">Subtarefa</span> : null}
      </p>
      <p className={`task-date task-date--${item.group}`}>
        {formatTaskDate(item.group, item.scheduledDate)}
      </p>
    </li>
  );
}

function formatTaskDate(group: TaskPriorityGroup, date: CivilDate | undefined): string {
  if (group === 'today') {
    return 'Hoje';
  }

  if (group === 'undated' || !date) {
    return 'Sem data';
  }

  const formattedDate = `${date.day.toString().padStart(2, '0')}/${date.month
    .toString()
    .padStart(2, '0')}`;
  return group === 'overdue' ? `Vencida · ${formattedDate}` : `Agendada · ${formattedDate}`;
}

function SummaryCard({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="card summary-card" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

interface GoogleStatusContent {
  readonly label: string;
  readonly tone: 'neutral' | 'positive' | 'warning';
  readonly message: string;
  readonly detail?: string;
}

function getGoogleStatusContent(state: PopupGoogleState, taskCount: number): GoogleStatusContent {
  switch (state.status) {
    case 'checking':
      return {
        label: 'Verificando',
        tone: 'neutral',
        message: 'Aguardando a verificação da conexão…',
      };
    case 'disconnected':
      return {
        label: 'Aguardando',
        tone: 'neutral',
        message: 'Conecte sua conta para carregar suas tarefas.',
      };
    case 'connecting':
      return {
        label: 'Aguardando',
        tone: 'neutral',
        message: 'Aguardando a autorização para carregar tarefas.',
      };
    case 'loading':
      return {
        label: 'Carregando',
        tone: 'neutral',
        message: taskCount > 0 ? 'Atualizando suas tarefas…' : 'Carregando suas tarefas…',
        ...(taskCount > 0 ? { detail: availableTasksMessage(taskCount) } : {}),
      };
    case 'ready':
      return {
        label: 'Conectado',
        tone: 'positive',
        message: availableTasksMessage(taskCount),
      };
    case 'empty':
      return {
        label: 'Tudo em dia',
        tone: 'positive',
        message: 'Nenhuma tarefa disponível nas suas listas.',
      };
    case 'partial':
      return {
        label: 'Incompleto',
        tone: 'warning',
        message: 'Algumas listas não puderam ser carregadas.',
        detail:
          taskCount > 0
            ? `${availableTasksMessage(taskCount)} O resultado ainda está incompleto.`
            : 'O resultado está incompleto e não representa uma lista vazia.',
      };
    case 'offline':
      return {
        label: 'Indisponível',
        tone: 'warning',
        message: 'Não foi possível acessar o Google Tasks agora.',
        detail:
          taskCount > 0
            ? `${availableTasksMessage(taskCount)} Seus dados de tempo continuam disponíveis abaixo.`
            : 'Verifique sua conexão e tente novamente. Seus dados de tempo continuam disponíveis abaixo.',
      };
    case 'error':
      return {
        label: 'Atenção',
        tone: 'warning',
        message: 'Não foi possível carregar suas tarefas.',
        detail:
          taskCount > 0
            ? `${availableTasksMessage(taskCount)} Você pode tentar novamente.`
            : 'Tente novamente. Seus dados de tempo não foram alterados.',
      };
  }
}

function availableTasksMessage(taskCount: number): string {
  return taskCount === 1 ? '1 tarefa disponível.' : `${taskCount} tarefas disponíveis.`;
}

function isRetryableState(status: PopupGoogleState['status']): boolean {
  return ['ready', 'empty', 'partial', 'offline', 'error'].includes(status);
}

function connectionLabel(status: PopupGoogleState['status']): string {
  switch (status) {
    case 'checking':
      return 'Verificando';
    case 'disconnected':
      return 'Desconectado';
    case 'connecting':
      return 'Conectando';
    case 'error':
      return 'Atenção';
    default:
      return 'Conectado';
  }
}

function connectionTone(status: PopupGoogleState['status']): GoogleStatusContent['tone'] {
  return status === 'error'
    ? 'warning'
    : ['loading', 'ready', 'empty', 'partial', 'offline'].includes(status)
      ? 'positive'
      : 'neutral';
}

function connectionMessage(status: PopupGoogleState['status']): string {
  switch (status) {
    case 'checking':
      return 'Verificando sua conexão com o Google…';
    case 'disconnected':
      return 'Conecte sua conta para acessar o Google Tasks.';
    case 'connecting':
      return 'Conclua a autorização do Google para continuar.';
    case 'error':
      return 'Não foi possível confirmar sua conexão agora.';
    default:
      return 'Acesso ao Google autorizado.';
  }
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':');
}

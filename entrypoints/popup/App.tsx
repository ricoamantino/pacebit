import type { ReactNode } from 'react';
import type { CivilDate } from '../../src/tasks/scheduled-date';
import type { PrioritizedGoogleTask, TaskPriorityGroup } from '../../src/tasks/task-priority';
import {
  type PopupDependencies,
  type PopupGoogleState,
  type PopupLocalState,
  type PopupSessionSelectionState,
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
        sessionSelection={controller.sessionSelection}
        onConnect={controller.connectGoogle}
        onRetry={controller.retryGoogle}
        onSelectTask={controller.selectTask}
        onStartSession={controller.startSelectedSession}
      />
      <LocalTotals state={controller.local} />
    </main>
  );
}

interface GoogleStatusProps {
  readonly state: PopupGoogleState;
  readonly taskCount: number;
  readonly prioritizedTasks: readonly PrioritizedGoogleTask[];
  readonly sessionSelection: PopupSessionSelectionState;
  readonly onConnect: () => void;
  readonly onRetry: () => void;
  readonly onSelectTask: (taskListId: string, taskId: string) => void;
  readonly onStartSession: () => void;
}

function GoogleStatus({
  state,
  taskCount,
  prioritizedTasks,
  sessionSelection,
  onConnect,
  onRetry,
  onSelectTask,
  onStartSession,
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

        <div id="connection-status" className="status-message" role="status" aria-atomic="true">
          <p>{connectionMessage(state.status)}</p>
          {state.status === 'disconnected' ? (
            <p className="status-detail">
              O acesso é usado somente para ler tarefas e concluir uma tarefa quando você pedir.
            </p>
          ) : null}
        </div>

        {state.status === 'disconnected' ? (
          <button
            className="primary-button"
            type="button"
            aria-describedby="connection-status"
            onClick={onConnect}
          >
            Conectar com Google
          </button>
        ) : null}

        {state.status === 'connecting' ? (
          <button
            className="primary-button"
            type="button"
            aria-busy="true"
            aria-describedby="connection-status"
            disabled
          >
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

        <div id="tasks-status" className="status-message" role="status" aria-atomic="true">
          <p>{content.message}</p>
          {content.detail ? <p className="status-detail">{content.detail}</p> : null}
        </div>

        {prioritizedTasks.length > 0 ? (
          <fieldset
            className="task-selection"
            aria-describedby="session-selection-status"
            disabled={
              sessionSelection.status === 'blocked' || sessionSelection.status === 'starting'
            }
          >
            <legend className="visually-hidden">Escolha uma tarefa</legend>
            <TaskGroups
              tasks={prioritizedTasks}
              selectedTask={getSelectedTask(sessionSelection)}
              onSelectTask={onSelectTask}
            />
          </fieldset>
        ) : null}

        {prioritizedTasks.length > 0 ? (
          <SessionSelection state={sessionSelection} onStartSession={onStartSession} />
        ) : null}

        {state.status === 'loading' ? (
          <p id="tasks-loading-status" className="loading-detail" role="status">
            Outras listas ou páginas ainda estão sendo carregadas.
          </p>
        ) : null}

        {isRetryableState(state.status) ? (
          <button
            className="secondary-button"
            type="button"
            aria-describedby="tasks-status"
            onClick={onRetry}
          >
            {state.status === 'ready' ? 'Atualizar tarefas' : 'Tentar novamente'}
          </button>
        ) : null}

        {state.status === 'loading' && taskCount > 0 ? (
          <button
            className="secondary-button"
            type="button"
            aria-busy="true"
            aria-describedby="tasks-status tasks-loading-status"
            disabled
          >
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
          <p className="local-warning" role="status" aria-atomic="true">
            Não foi possível atualizar os dados locais.
          </p>
        ) : null}
      </div>

      <SummaryCard id="current-session-heading" title="Sessão atual">
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
            <p className="summary-next-action">
              Próxima ação: {summary.activeSession.state === 'running' ? 'Pausar' : 'Retomar'}.
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
        <SummaryCard id="daily-total-heading" title="Total de hoje">
          <p className="summary-value">{summary ? formatDuration(summary.dailyTotalMs) : '—'}</p>
          <p className="summary-detail">Tempo efetivamente registrado.</p>
        </SummaryCard>

        <SummaryCard id="history-heading" title="Histórico">
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

function TaskGroups({
  tasks,
  selectedTask,
  onSelectTask,
}: {
  readonly tasks: readonly PrioritizedGoogleTask[];
  readonly selectedTask: PrioritizedGoogleTask | null;
  readonly onSelectTask: (taskListId: string, taskId: string) => void;
}) {
  return (
    <div className="task-groups">
      {taskGroups.map((group) => {
        const groupTasks = tasks.filter((task) => task.group === group.id);

        return groupTasks.length > 0 ? (
          <section className="task-group" aria-labelledby={`task-group-${group.id}`} key={group.id}>
            <h3 id={`task-group-${group.id}`}>{group.title}</h3>
            <ul className="task-list">
              {groupTasks.map((item) => (
                <TaskItem
                  item={item}
                  selected={haveSameTask(item, selectedTask)}
                  onSelect={onSelectTask}
                  key={`${item.taskList.id}:${item.task.id}`}
                />
              ))}
            </ul>
          </section>
        ) : null;
      })}
    </div>
  );
}

function TaskItem({
  item,
  selected,
  onSelect,
}: {
  readonly item: PrioritizedGoogleTask;
  readonly selected: boolean;
  readonly onSelect: (taskListId: string, taskId: string) => void;
}) {
  return (
    <li className={`task-item${selected ? ' task-item--selected' : ''}`}>
      <label className="task-option">
        <input
          className="task-option-input"
          type="radio"
          name="pacebit-task"
          checked={selected}
          onChange={() => onSelect(item.taskList.id, item.task.id)}
        />
        <span className="task-option-content">
          <span className="task-title">{item.task.title || 'Sem título'}</span>
          <span className="task-context">
            <span>{item.taskList.title || 'Lista sem título'}</span>
            {item.task.parentId ? <span className="task-kind">Subtarefa</span> : null}
          </span>
          <span className={`task-date task-date--${item.group}`}>
            {formatTaskDate(item.group, item.scheduledDate)}
          </span>
        </span>
      </label>
    </li>
  );
}

function SessionSelection({
  state,
  onStartSession,
}: {
  readonly state: PopupSessionSelectionState;
  readonly onStartSession: () => void;
}) {
  const selectedTask = getSelectedTask(state);

  return (
    <section className="session-selection" aria-labelledby="session-selection-heading">
      <h3 id="session-selection-heading">Início da sessão</h3>
      <div id="session-selection-status" className="selection-status" role="status" aria-atomic>
        <p>{selectionMessage(state)}</p>
        {selectedTask ? (
          <p className="selection-detail">
            <strong>{selectedTask.task.title || 'Sem título'}</strong>
            <span>{selectedTask.taskList.title || 'Lista sem título'}</span>
          </p>
        ) : null}
      </div>

      {state.status === 'selecting' && state.selectedTask ? (
        <button
          className="primary-button"
          type="button"
          aria-describedby="session-selection-status"
          onClick={onStartSession}
        >
          Iniciar sessão
        </button>
      ) : null}

      {state.status === 'failed' ? (
        <button
          className="primary-button"
          type="button"
          aria-describedby="session-selection-status"
          onClick={onStartSession}
        >
          Tentar iniciar novamente
        </button>
      ) : null}

      {state.status === 'starting' ? (
        <button
          className="primary-button"
          type="button"
          aria-busy="true"
          aria-describedby="session-selection-status"
          disabled
        >
          Iniciando…
        </button>
      ) : null}
    </section>
  );
}

function getSelectedTask(state: PopupSessionSelectionState): PrioritizedGoogleTask | null {
  return state.status === 'selecting' || state.status === 'starting' || state.status === 'failed'
    ? state.selectedTask
    : null;
}

function selectionMessage(state: PopupSessionSelectionState): string {
  if (state.status === 'blocked') {
    switch (state.reason) {
      case 'local-loading':
        return 'Aguarde a recuperação dos dados locais para selecionar uma tarefa.';
      case 'local-unavailable':
        return 'Não foi possível confirmar os dados locais. Tente reabrir o popup.';
      case 'active-session':
        return 'Finalize ou cancele a sessão atual antes de iniciar outra.';
    }
  }

  if (state.status === 'starting') {
    return 'Salvando a sessão no armazenamento local…';
  }

  if (state.status === 'failed') {
    return state.reason === 'storage-full'
      ? 'O armazenamento local está sem espaço. Libere espaço e tente novamente.'
      : 'Não foi possível salvar a sessão. Tente novamente.';
  }

  return state.selectedTask
    ? 'Tarefa selecionada. Confirme para iniciar o timer.'
    : 'Selecione uma tarefa para iniciar o timer.';
}

function haveSameTask(left: PrioritizedGoogleTask, right: PrioritizedGoogleTask | null): boolean {
  return left.task.id === right?.task.id && left.taskList.id === right.taskList.id;
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
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="card summary-card" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
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

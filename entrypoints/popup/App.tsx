import { type ReactNode, useState } from 'react';
import type { CivilDate } from '../../src/tasks/scheduled-date';
import type { PrioritizedGoogleTask, TaskPriorityGroup } from '../../src/tasks/task-priority';
import type { CompletedSession } from '../../src/timer/session';
import { formatDuration, formatSessionInterval } from './time-format';
import {
  type PopupDependencies,
  type PopupGoogleState,
  type PopupLocalState,
  type PopupSessionSelectionState,
  type PopupTimerAction,
  type PopupTimerControlsState,
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

      <CurrentSession
        state={controller.local}
        controls={controller.timerControls}
        onPause={controller.pauseActiveSession}
        onResume={controller.resumeActiveSession}
        onFinish={controller.finishActiveSession}
        onCancel={controller.cancelActiveSession}
      />
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

function CurrentSession({
  state,
  controls,
  onPause,
  onResume,
  onFinish,
  onCancel,
}: {
  readonly state: PopupLocalState;
  readonly controls: PopupTimerControlsState;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onFinish: () => void;
  readonly onCancel: () => void;
}) {
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
              {summary.finalizationPending
                ? 'Finalização pendente'
                : summary.activeSession.state === 'running'
                  ? 'Em execução'
                  : 'Pausada'}
            </p>
            <p className="summary-next-action">
              Próxima ação:{' '}
              {summary.finalizationPending
                ? 'Concluir finalização'
                : summary.activeSession.state === 'running'
                  ? 'Pausar'
                  : 'Retomar'}
              .
            </p>
            <TimerControls
              sessionState={summary.activeSession.state}
              finalizationPending={summary.finalizationPending}
              state={controls}
              onPause={onPause}
              onResume={onResume}
              onFinish={onFinish}
              onCancel={onCancel}
            />
          </>
        ) : (
          <>
            <p>{unavailable ? 'Dados locais indisponíveis.' : 'Nenhuma sessão em andamento.'}</p>
            <TimerStatus state={controls} />
          </>
        )}
      </SummaryCard>
    </section>
  );
}

function TimerControls({
  sessionState,
  finalizationPending,
  state,
  onPause,
  onResume,
  onFinish,
  onCancel,
}: {
  readonly sessionState: 'running' | 'paused';
  readonly finalizationPending: boolean;
  readonly state: PopupTimerControlsState;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onFinish: () => void;
  readonly onCancel: () => void;
}) {
  const workingAction = state.status === 'working' ? state.action : null;
  const disabled = state.status === 'working' || state.status === 'unavailable';

  return (
    <div className="timer-control-area">
      <TimerStatus state={state} />
      <fieldset className="timer-controls">
        <legend className="visually-hidden">Controles da sessão</legend>
        {finalizationPending ? (
          <TimerButton
            action="finish"
            className="primary-button"
            label="Concluir finalização"
            workingAction={workingAction}
            disabled={disabled}
            onClick={onFinish}
          />
        ) : (
          <>
            <TimerButton
              action={sessionState === 'running' ? 'pause' : 'resume'}
              className="primary-button"
              label={sessionState === 'running' ? 'Pausar' : 'Retomar'}
              workingAction={workingAction}
              disabled={disabled}
              onClick={sessionState === 'running' ? onPause : onResume}
            />
            <TimerButton
              action="finish"
              className="secondary-button"
              label="Finalizar sessão"
              workingAction={workingAction}
              disabled={disabled}
              onClick={onFinish}
            />
            <TimerButton
              action="cancel"
              className="danger-button"
              label="Cancelar sessão"
              workingAction={workingAction}
              disabled={disabled}
              onClick={onCancel}
            />
          </>
        )}
      </fieldset>
    </div>
  );
}

function TimerButton({
  action,
  className,
  label,
  workingAction,
  disabled,
  onClick,
}: {
  readonly action: PopupTimerAction;
  readonly className: string;
  readonly label: string;
  readonly workingAction: PopupTimerAction | null;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  const working = workingAction === action;

  return (
    <button
      className={className}
      type="button"
      aria-busy={working || undefined}
      aria-describedby="timer-action-status"
      disabled={disabled}
      onClick={onClick}
    >
      {working ? workingActionLabel(action) : label}
    </button>
  );
}

function TimerStatus({ state }: { readonly state: PopupTimerControlsState }) {
  const message = timerStatusMessage(state);

  return (
    <p id="timer-action-status" className="timer-action-status" role="status" aria-atomic="true">
      {message}
    </p>
  );
}

function workingActionLabel(action: PopupTimerAction): string {
  switch (action) {
    case 'pause':
      return 'Pausando…';
    case 'resume':
      return 'Retomando…';
    case 'finish':
      return 'Finalizando…';
    case 'cancel':
      return 'Cancelando…';
  }
}

function timerStatusMessage(state: PopupTimerControlsState): string {
  switch (state.status) {
    case 'idle':
      return 'Cada ação será salva no armazenamento local.';
    case 'unavailable':
      return 'Os controles estão indisponíveis até os dados locais serem validados.';
    case 'working':
      return `${workingActionLabel(state.action)} Aguarde a confirmação local.`;
    case 'conflict':
      return 'A sessão foi atualizada em outra janela. O estado mais recente está sendo exibido.';
    case 'finalization-pending':
      return 'O histórico já foi salvo. Conclua a finalização para limpar a sessão ativa.';
    case 'succeeded':
      return state.action === 'cancel'
        ? 'Sessão cancelada. Nenhum tempo foi adicionado ao histórico.'
        : 'Sessão finalizada e salva no histórico.';
    case 'failed':
      return timerFailureMessage(state.reason);
  }
}

function timerFailureMessage(
  reason: Extract<PopupTimerControlsState, { status: 'failed' }>['reason'],
): string {
  switch (reason) {
    case 'storage-full':
      return 'O armazenamento local está sem espaço. A sessão foi preservada; tente novamente.';
    case 'storage-unavailable':
      return 'Não foi possível confirmar a ação. A sessão foi preservada; tente novamente.';
    case 'invalid-local-data':
      return 'Os dados locais não puderam ser validados. Nenhuma alteração foi feita.';
    case 'invalid-clock':
      return 'A data e a hora do dispositivo não permitem registrar esta ação agora.';
    case 'state-changed':
      return 'A sessão mudou antes da confirmação. Confira o estado atual e tente novamente.';
  }
}

function LocalTotals({ state }: { readonly state: PopupLocalState }) {
  const summary = state.status === 'loading' ? undefined : state.value;

  return (
    <section className="local-overview" aria-labelledby="totals-heading">
      <h2 id="totals-heading">Resumo local</h2>
      <SummaryCard id="daily-total-heading" title="Total de hoje">
        <p className="summary-value">{summary ? formatDuration(summary.dailyTotalMs) : '—'}</p>
        <p className="summary-detail">Tempo efetivamente registrado.</p>
      </SummaryCard>
      <HistoryCard state={state} />
    </section>
  );
}

const HISTORY_BATCH_SIZE = 20;

function HistoryCard({ state }: { readonly state: PopupLocalState }) {
  const [visibleCount, setVisibleCount] = useState(HISTORY_BATCH_SIZE);
  const summary = state.status === 'loading' ? undefined : state.value;
  const history = summary?.history ?? [];
  const visibleHistory = history.slice(0, visibleCount);
  const remainingCount = Math.max(0, history.length - visibleHistory.length);

  return (
    <section className="card history-card" aria-labelledby="history-heading">
      <div className="section-heading-row">
        <h3 id="history-heading">Histórico</h3>
        {summary ? (
          <span className="history-count">
            {history.length} {history.length === 1 ? 'sessão' : 'sessões'}
          </span>
        ) : null}
      </div>

      {state.status === 'loading' ? <p>Carregando histórico…</p> : null}
      {state.status === 'error' && !summary ? <p>Histórico indisponível.</p> : null}
      {state.status === 'error' && summary ? (
        <p className="history-warning" role="status">
          Exibindo o último histórico local disponível.
        </p>
      ) : null}
      {summary && history.length === 0 ? <p>Nenhuma sessão concluída neste perfil.</p> : null}
      {visibleHistory.length > 0 ? (
        <ol className="history-list" aria-label="Sessões concluídas">
          {visibleHistory.map((session) => (
            <HistoryItem session={session} key={session.id} />
          ))}
        </ol>
      ) : null}
      {remainingCount > 0 ? (
        <button
          className="secondary-button"
          type="button"
          onClick={() => setVisibleCount((current) => current + HISTORY_BATCH_SIZE)}
        >
          Mostrar mais 20 sessões
        </button>
      ) : null}
    </section>
  );
}

function HistoryItem({ session }: { readonly session: CompletedSession }) {
  return (
    <li className="history-item">
      <p className="history-task-title">{session.task.title || 'Sem título'}</p>
      <p className="history-list-title">{session.taskList.title || 'Lista sem título'}</p>
      <p className="history-interval">{formatSessionInterval(session)}</p>
      <p className="history-duration">Duração · {formatDuration(session.durationMs)}</p>
    </li>
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

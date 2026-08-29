import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../entrypoints/popup/App';
import type { PopupDependencies } from '../../entrypoints/popup/usePopupController';
import type { GoogleAuthorizationResult } from '../../src/google/authorization';
import type { GoogleTaskListLoad, GoogleTasksCatalogResult } from '../../src/google/tasks-catalog';
import type {
  StoredTimerState,
  StoredTimerStateObservation,
} from '../../src/storage/session-storage';

const NOW_MS = 10_000;
const EMPTY_TIMER_STATE: StoredTimerState = { activeSession: null, history: [] };

describe('App', () => {
  it('autoriza interativamente somente depois da ação explícita do usuário', async () => {
    const interactiveAuthorization = Promise.withResolvers<GoogleAuthorizationResult>();
    const dependencies = createDependencies({
      requestAuthorization: vi.fn(() => interactiveAuthorization.promise),
    });

    render(<App dependencies={dependencies} />);

    const connect = await screen.findByRole('button', { name: 'Conectar com Google' });
    expect(dependencies.requestAuthorization).not.toHaveBeenCalled();
    expect(dependencies.getAuthorization).toHaveBeenCalledOnce();

    fireEvent.click(connect);

    const connecting = await screen.findByRole('button', { name: 'Conectando…' });
    expect(connecting).toBeDisabled();
    fireEvent.click(connecting);
    expect(dependencies.requestAuthorization).toHaveBeenCalledOnce();

    interactiveAuthorization.resolve({ status: 'authorized', accessToken: 'interactive-token' });

    expect(await screen.findByText('Nenhuma tarefa disponível nas suas listas.')).toBeVisible();
    expect(dependencies.loadTasksCatalog).toHaveBeenCalledWith(
      'interactive-token',
      expect.any(AbortSignal),
    );
  });

  it('mantém a estrutura local visível enquanto as tarefas estão carregando', async () => {
    const catalog = Promise.withResolvers<GoogleTasksCatalogResult>();
    const dependencies = createDependencies({
      getAuthorization: authorized('silent-token'),
      loadTasksCatalog: vi.fn(() => catalog.promise),
    });

    render(<App dependencies={dependencies} />);

    expect(await screen.findByText('Carregando suas tarefas…')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sessão atual' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Total de hoje' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Histórico' })).toBeVisible();

    catalog.resolve({ status: 'complete', taskLists: [completeTaskList()] });

    expect(await screen.findByText('1 tarefa disponível.')).toBeVisible();
  });

  it('diferencia a verificação inicial e o carregamento dos dados locais', () => {
    const authorization = Promise.withResolvers<GoogleAuthorizationResult>();
    const dependencies = createDependencies({
      getAuthorization: vi.fn(() => authorization.promise),
      observeTimerState: () => () => {},
    });

    render(<App dependencies={dependencies} />);

    expect(screen.getByText('Verificando sua conexão com o Google…')).toBeVisible();
    expect(screen.getByText('Carregando dados locais…')).toBeVisible();
  });

  it.each([
    [
      'vazio real',
      { status: 'complete', taskLists: [] } satisfies GoogleTasksCatalogResult,
      'Nenhuma tarefa disponível nas suas listas.',
    ],
    [
      'resultado parcial',
      {
        status: 'partial',
        taskLists: [incompleteTaskList()],
      } satisfies GoogleTasksCatalogResult,
      'Algumas listas não puderam ser carregadas.',
    ],
    [
      'indisponibilidade',
      {
        status: 'failed',
        reason: 'unavailable',
        taskLists: [],
      } satisfies GoogleTasksCatalogResult,
      'Não foi possível acessar o Google Tasks agora.',
    ],
    [
      'erro recuperável',
      {
        status: 'failed',
        reason: 'forbidden',
        taskLists: [],
      } satisfies GoogleTasksCatalogResult,
      'Não foi possível carregar suas tarefas.',
    ],
  ])('apresenta o estado de %s sem detalhes internos', async (_name, result, message) => {
    const dependencies = createDependencies({
      getAuthorization: authorized('controlled-token'),
      loadTasksCatalog: vi.fn().mockResolvedValue(result),
    });

    render(<App dependencies={dependencies} />);

    expect(await screen.findByText(message)).toBeVisible();
    expect(document.body).not.toHaveTextContent('controlled-token');
    expect(document.body).not.toHaveTextContent('forbidden');
    expect(document.body).not.toHaveTextContent('unavailable');
  });

  it('preserva tarefas válidas durante o retry e depois de uma falha', async () => {
    const retry = Promise.withResolvers<GoogleTasksCatalogResult>();
    const loadTasksCatalog = vi
      .fn()
      .mockResolvedValueOnce({ status: 'complete', taskLists: [completeTaskList()] })
      .mockImplementationOnce(() => retry.promise);
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      loadTasksCatalog,
    });

    render(<App dependencies={dependencies} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar tarefas' }));

    expect(await screen.findByRole('button', { name: 'Atualizando…' })).toBeDisabled();
    expect(screen.getByText('1 tarefa disponível.')).toBeVisible();

    retry.resolve({ status: 'failed', reason: 'unavailable', taskLists: [] });

    expect(await screen.findByText('Não foi possível acessar o Google Tasks agora.')).toBeVisible();
    expect(screen.getByText(/1 tarefa disponível/)).toBeVisible();
  });

  it('remove o token inválido e tenta uma única renovação silenciosa após 401', async () => {
    const loadTasksCatalog = vi
      .fn()
      .mockResolvedValueOnce({ status: 'authorization-required', taskLists: [] })
      .mockResolvedValueOnce({ status: 'complete', taskLists: [] });
    const dependencies = createDependencies({
      getAuthorization: authorized('invalid-token'),
      renewAuthorization: authorizedRenewal('renewed-token'),
      loadTasksCatalog,
    });

    render(<App dependencies={dependencies} />);

    expect(await screen.findByText('Nenhuma tarefa disponível nas suas listas.')).toBeVisible();
    expect(dependencies.renewAuthorization).toHaveBeenCalledOnce();
    expect(dependencies.renewAuthorization).toHaveBeenCalledWith('invalid-token');
    expect(loadTasksCatalog).toHaveBeenCalledTimes(2);
    expect(loadTasksCatalog.mock.calls.map(([token]) => token)).toEqual([
      'invalid-token',
      'renewed-token',
    ]);
  });

  it('cancela o carregamento ao desmontar e descarta sua resposta', async () => {
    const catalog = Promise.withResolvers<GoogleTasksCatalogResult>();
    const loadTasksCatalog = vi.fn<PopupDependencies['loadTasksCatalog']>(() => catalog.promise);
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      loadTasksCatalog,
    });
    const view = render(<App dependencies={dependencies} />);

    await screen.findByText('Carregando suas tarefas…');
    const signal = loadTasksCatalog.mock.calls[0]?.[1];

    view.unmount();
    expect(signal?.aborted).toBe(true);

    catalog.resolve({ status: 'complete', taskLists: [completeTaskList()] });
    await Promise.resolve();
    expect(document.body).not.toHaveTextContent('1 tarefa disponível.');
  });

  it('limpa efeitos corretamente quando o React remonta a árvore em StrictMode', async () => {
    const stops: Array<ReturnType<typeof vi.fn>> = [];
    const observeTimerState = vi.fn((listener: (state: StoredTimerStateObservation) => void) => {
      listener({ status: 'ready', value: EMPTY_TIMER_STATE });
      const stop = vi.fn();
      stops.push(stop);
      return stop;
    });
    const dependencies = createDependencies({ observeTimerState });
    const view = render(
      <StrictMode>
        <App dependencies={dependencies} />
      </StrictMode>,
    );

    await screen.findByRole('button', { name: 'Conectar com Google' });
    expect(observeTimerState).toHaveBeenCalledTimes(2);
    expect(stops[0]).toHaveBeenCalledOnce();

    view.unmount();
    expect(stops[1]).toHaveBeenCalledOnce();
  });

  it('mantém sessão, total e histórico disponíveis quando o Google está offline', async () => {
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'failed',
        reason: 'unavailable',
        taskLists: [],
      }),
      observeTimerState: observeReadyTimerState(activeTimerState()),
    });

    render(<App dependencies={dependencies} />);

    expect(await screen.findByText('Não foi possível acessar o Google Tasks agora.')).toBeVisible();
    expect(screen.getByText('Preparar relatório')).toBeVisible();
    expect(screen.getByText(/Trabalho · Em execução/)).toBeVisible();
    expect(screen.getByRole('region', { name: 'Sessão atual' })).toHaveTextContent('00:00:05');
    expect(screen.getByRole('region', { name: 'Total de hoje' })).toHaveTextContent('00:00:07');
    expect(screen.getByRole('region', { name: 'Histórico' })).toHaveTextContent('1');
  });

  it('atualiza a duração apresentada a cada segundo sem alterar a sessão persistida', () => {
    vi.useFakeTimers();
    let nowMs = NOW_MS;
    const timerState = activeTimerState();
    const dependencies = createDependencies({
      getAuthorization: vi.fn(() => new Promise<GoogleAuthorizationResult>(() => {})),
      observeTimerState: observeReadyTimerState(timerState),
      now: () => nowMs,
    });

    try {
      render(<App dependencies={dependencies} />);
      expect(screen.getByRole('region', { name: 'Sessão atual' })).toHaveTextContent('00:00:05');

      nowMs += 1_000;
      act(() => vi.advanceTimersByTime(1_000));

      expect(screen.getByRole('region', { name: 'Sessão atual' })).toHaveTextContent('00:00:06');
      expect(timerState.activeSession?.state).toBe('running');

      if (timerState.activeSession?.state !== 'running') {
        throw new Error('Expected the controlled session to remain running.');
      }

      expect(timerState.activeSession?.runningSinceMs).toBe(5_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['inválido', { status: 'invalid' } satisfies StoredTimerStateObservation],
    [
      'indisponível',
      { status: 'failed', reason: 'storage-unavailable' } satisfies StoredTimerStateObservation,
    ],
  ])('mantém a estrutura segura diante de armazenamento %s', async (_name, observation) => {
    const dependencies = createDependencies({
      observeTimerState: (listener) => {
        listener(observation);
        return () => {};
      },
    });

    render(<App dependencies={dependencies} />);

    expect(await screen.findByText('Não foi possível atualizar os dados locais.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sessão atual' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Total de hoje' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Histórico' })).toBeVisible();
    expect(document.body).not.toHaveTextContent('storage-unavailable');
  });

  it('preserva o último resumo local se uma observação posterior falhar', async () => {
    let notify: ((observation: StoredTimerStateObservation) => void) | undefined;
    const dependencies = createDependencies({
      observeTimerState: (listener) => {
        notify = listener;
        listener({ status: 'ready', value: activeTimerState() });
        return () => {};
      },
    });

    render(<App dependencies={dependencies} />);
    expect(await screen.findByText('Preparar relatório')).toBeVisible();

    act(() => notify?.({ status: 'failed', reason: 'storage-unavailable' }));

    expect(await screen.findByText('Não foi possível atualizar os dados locais.')).toBeVisible();
    expect(screen.getByText('Preparar relatório')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Histórico' })).toHaveTextContent('1');
  });
});

function createDependencies(overrides: Partial<PopupDependencies> = {}): PopupDependencies {
  return {
    getAuthorization: vi.fn().mockResolvedValue({ status: 'authorization-required' }),
    requestAuthorization: vi.fn().mockResolvedValue({ status: 'failed' }),
    renewAuthorization: vi.fn().mockResolvedValue({ status: 'authorization-required' }),
    loadTasksCatalog: vi.fn().mockResolvedValue({ status: 'complete', taskLists: [] }),
    observeTimerState: observeReadyTimerState(EMPTY_TIMER_STATE),
    now: () => NOW_MS,
    ...overrides,
  };
}

function authorized(accessToken: string): PopupDependencies['getAuthorization'] {
  return vi.fn().mockResolvedValue({ status: 'authorized', accessToken });
}

function authorizedRenewal(accessToken: string): PopupDependencies['renewAuthorization'] {
  return vi.fn().mockResolvedValue({ status: 'authorized', accessToken });
}

function observeReadyTimerState(value: StoredTimerState): PopupDependencies['observeTimerState'] {
  return vi.fn((listener) => {
    listener({ status: 'ready', value });
    return () => {};
  });
}

function completeTaskList(): Extract<GoogleTaskListLoad, { readonly status: 'complete' }> {
  return {
    status: 'complete',
    taskList: { id: 'list-1', title: 'Trabalho' },
    tasks: [
      {
        id: 'task-1',
        title: 'Preparar relatório',
        position: '0001',
        status: 'needsAction',
        deleted: false,
        hidden: false,
        assigned: false,
      },
    ],
  };
}

function incompleteTaskList(): GoogleTaskListLoad {
  return { ...completeTaskList(), status: 'incomplete', reason: 'forbidden' };
}

function activeTimerState(): StoredTimerState {
  return {
    activeSession: {
      id: 'active-session',
      state: 'running',
      task: { id: 'task-1', title: 'Preparar relatório' },
      taskList: { id: 'list-1', title: 'Trabalho' },
      startedAtMs: 5_000,
      periods: [],
      runningSinceMs: 5_000,
    },
    history: [
      {
        id: 'completed-session',
        task: { id: 'task-2', title: 'Revisar documento' },
        taskList: { id: 'list-1', title: 'Trabalho' },
        startedAtMs: 1_000,
        endedAtMs: 3_000,
        periods: [{ startedAtMs: 1_000, endedAtMs: 3_000 }],
        durationMs: 2_000,
      },
    ],
  };
}

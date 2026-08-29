import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../entrypoints/popup/App';
import type { PopupDependencies } from '../../entrypoints/popup/usePopupController';
import type { GoogleAuthorizationResult } from '../../src/google/authorization';
import type {
  GoogleTaskListLoad,
  GoogleTasksCatalogProgressListener,
  GoogleTasksCatalogResult,
} from '../../src/google/tasks-catalog';
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
    expect(connect).toHaveAccessibleDescription(
      /Conecte sua conta para acessar o Google Tasks.*O acesso é usado somente para ler tarefas/,
    );

    fireEvent.click(connect);

    const connecting = await screen.findByRole('button', { name: 'Conectando…' });
    expect(connecting).toBeDisabled();
    expect(connecting).toHaveAttribute('aria-busy', 'true');
    expect(connecting).toHaveAccessibleDescription(
      'Conclua a autorização do Google para continuar.',
    );
    fireEvent.click(connecting);
    expect(dependencies.requestAuthorization).toHaveBeenCalledOnce();

    interactiveAuthorization.resolve({ status: 'authorized', accessToken: 'interactive-token' });

    expect(await screen.findByText('Nenhuma tarefa disponível nas suas listas.')).toBeVisible();
    expect(dependencies.loadTasksCatalog).toHaveBeenCalledWith(
      'interactive-token',
      expect.any(AbortSignal),
      expect.any(Function),
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

  it('apresenta tarefas progressivamente e mantém o catálogo anterior durante atualização', async () => {
    const initialCatalog = Promise.withResolvers<GoogleTasksCatalogResult>();
    const refreshedCatalog = Promise.withResolvers<GoogleTasksCatalogResult>();
    const loadTasksCatalog = vi
      .fn<PopupDependencies['loadTasksCatalog']>()
      .mockImplementationOnce((_token, _signal, onProgress) => {
        onProgress?.({
          taskLists: [
            taskList('loading', 'list-progress', 'Em andamento', [
              taskItem('progress-task', 'Página disponível'),
            ]),
          ],
        });
        return initialCatalog.promise;
      })
      .mockImplementationOnce((_token, _signal, onProgress) => {
        onProgress?.({
          taskLists: [
            taskList('loading', 'list-new', 'Não substituir', [
              taskItem('new-task', 'Conteúdo intermediário'),
            ]),
          ],
        });
        return refreshedCatalog.promise;
      });
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      loadTasksCatalog,
    });

    render(<App dependencies={dependencies} />);

    const tasksRegion = await screen.findByRole('region', { name: 'Tarefas' });
    expect(tasksRegion).toHaveAttribute('aria-busy', 'true');
    expect(within(tasksRegion).getByText('Página disponível')).toBeVisible();
    expect(within(tasksRegion).getByText(/outras listas ou páginas/i)).toBeVisible();

    initialCatalog.resolve({
      status: 'complete',
      taskLists: [
        taskList('complete', 'list-progress', 'Em andamento', [
          taskItem('progress-task', 'Página disponível'),
        ]),
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar tarefas' }));

    expect(tasksRegion).toHaveAttribute('aria-busy', 'true');
    expect(within(tasksRegion).getByText('Página disponível')).toBeVisible();
    expect(within(tasksRegion).queryByText('Conteúdo intermediário')).not.toBeInTheDocument();
    const updating = within(tasksRegion).getByRole('button', { name: 'Atualizando…' });
    expect(updating).toBeDisabled();
    expect(updating).toHaveAttribute('aria-busy', 'true');
    expect(updating).toHaveAccessibleDescription(
      /Atualizando suas tarefas.*Outras listas ou páginas ainda estão sendo carregadas/,
    );

    refreshedCatalog.resolve({ status: 'complete', taskLists: [] });
    expect(await screen.findByText('Nenhuma tarefa disponível nas suas listas.')).toBeVisible();
  });

  it('prioriza grupos, datas e desempates e identifica lista e subtarefa', async () => {
    const todayMs = new Date(2026, 7, 29, 12).getTime();
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      now: () => todayMs,
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'complete',
        taskLists: [
          taskList('complete', 'first', 'Trabalho', [
            taskItem('today-b', 'Mesmo título', { due: '2026-08-29', position: '0002' }),
            taskItem('future', 'Futura', { due: '2026-08-30' }),
            taskItem('overdue', 'Atrasada', { due: '2026-08-28' }),
            taskItem('today-a', 'Mesmo título', {
              due: '2026-08-29',
              position: '0001',
              parentId: 'parent',
            }),
          ]),
          taskList('complete', 'second', '', [taskItem('undated', '')]),
        ],
      }),
    });

    render(<App dependencies={dependencies} />);

    const tasksRegion = await screen.findByRole('region', { name: 'Tarefas' });
    const groupHeadings = within(tasksRegion).getAllByRole('heading', { level: 3 });
    expect(groupHeadings.map(({ textContent }) => textContent)).toEqual([
      'Vencidas',
      'Hoje',
      'Sem data',
      'Futuras',
    ]);
    expect(within(tasksRegion).getByText('Vencida · 28/08')).toBeVisible();
    expect(within(tasksRegion).getByText('Agendada · 30/08')).toBeVisible();
    expect(within(tasksRegion).getAllByText('Mesmo título')).toHaveLength(2);
    expect(within(tasksRegion).getByText('Subtarefa')).toBeVisible();
    expect(within(tasksRegion).getAllByText('Trabalho')).toHaveLength(4);
    expect(within(tasksRegion).getByText('Lista sem título')).toBeVisible();
    expect(within(tasksRegion).getByText('Sem título')).toBeVisible();

    const todayGroup = within(tasksRegion).getByRole('heading', { name: 'Hoje' }).parentElement;

    if (!todayGroup) {
      throw new Error('Expected the Today group to have a section element.');
    }

    const todayItems = within(todayGroup).getAllByRole('listitem');
    expect(todayItems[0]).toHaveTextContent('Subtarefa');
    expect(todayItems[1]).not.toHaveTextContent('Subtarefa');
  });

  it('mantém a sessão antes das tarefas e trata conteúdo remoto como texto', async () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      observeTimerState: observeReadyTimerState(activeTimerState()),
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'partial',
        taskLists: [
          taskList('incomplete', 'unsafe-list', '<script>lista</script>', [
            taskItem('unsafe-task', malicious),
          ]),
        ],
      }),
    });

    render(<App dependencies={dependencies} />);

    const session = screen.getByRole('region', { name: 'Sessão atual' });
    const tasksRegion = await screen.findByRole('region', { name: 'Tarefas' });
    expect(
      session.compareDocumentPosition(tasksRegion) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(tasksRegion).getByText(malicious)).toBeVisible();
    expect(within(tasksRegion).getByText('<script>lista</script>')).toBeVisible();
    expect(within(tasksRegion).queryByRole('img')).not.toBeInTheDocument();
    expect(within(tasksRegion).getByText('Incompleto')).toBeVisible();
    expect(within(tasksRegion).queryByText('Tudo em dia')).not.toBeInTheDocument();
  });

  it('expõe regiões, listas e controles com semântica e nomes acessíveis', async () => {
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      observeTimerState: observeReadyTimerState(activeTimerState()),
      now: () => new Date(2026, 0, 2, 12).getTime(),
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'complete',
        taskLists: [
          taskList('complete', 'accessible-list', 'Trabalho', [
            taskItem('accessible-task', 'Preparar relatório', { due: '2026-01-01' }),
          ]),
        ],
      }),
    });

    render(<App dependencies={dependencies} />);

    expect(screen.getByRole('main')).toBeVisible();
    const regionNames = ['Sessão atual', 'Conexão Google', 'Tarefas', 'Total de hoje', 'Histórico'];

    for (const name of regionNames) {
      expect(await screen.findByRole('region', { name })).toBeVisible();
    }

    const tasksRegion = screen.getByRole('region', { name: 'Tarefas' });
    expect(within(tasksRegion).getByRole('list')).toBeVisible();
    expect(within(tasksRegion).getAllByRole('listitem')).toHaveLength(1);
    expect(within(tasksRegion).getByText('Vencida · 01/01')).toBeVisible();
    const update = within(tasksRegion).getByRole('button', { name: 'Atualizar tarefas' });
    expect(update).toHaveAccessibleDescription('1 tarefa disponível.');
    expect(document.querySelector('form')).not.toBeInTheDocument();
    expect(document.querySelector('[tabindex]')).not.toBeInTheDocument();
  });

  it('ignora progresso de uma operação substituída', async () => {
    let oldProgress: GoogleTasksCatalogProgressListener | undefined;
    const refresh = Promise.withResolvers<GoogleTasksCatalogResult>();
    const loadTasksCatalog = vi
      .fn<PopupDependencies['loadTasksCatalog']>()
      .mockImplementationOnce((_token, _signal, onProgress) => {
        oldProgress = onProgress;
        return Promise.resolve({
          status: 'complete',
          taskLists: [
            taskList('complete', 'current', 'Lista atual', [taskItem('current-task', 'Atual')]),
          ],
        });
      })
      .mockImplementationOnce(() => refresh.promise);
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      loadTasksCatalog,
    });

    render(<App dependencies={dependencies} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar tarefas' }));

    act(() => {
      oldProgress?.({
        taskLists: [
          taskList('loading', 'stale', 'Obsoleta', [taskItem('stale-task', 'Não mostrar')]),
        ],
      });
    });

    expect(screen.getByText('Atual')).toBeVisible();
    expect(screen.queryByText('Não mostrar')).not.toBeInTheDocument();
    refresh.resolve({ status: 'complete', taskLists: [] });
  });

  it('recalcula o grupo quando o dia local muda', async () => {
    vi.useFakeTimers();
    let nowMs = new Date(2026, 7, 29, 23, 59, 59).getTime();
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      now: () => nowMs,
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'complete',
        taskLists: [
          taskList('complete', 'dates', 'Datas', [
            taskItem('tomorrow', 'Virada do dia', { due: '2026-08-30' }),
          ]),
        ],
      }),
    });

    try {
      render(<App dependencies={dependencies} />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole('heading', { name: 'Futuras' })).toBeVisible();

      nowMs += 2_000;
      act(() => vi.advanceTimersByTime(1_000));

      expect(screen.getByRole('heading', { name: 'Hoje' })).toBeVisible();
      expect(screen.queryByRole('heading', { name: 'Futuras' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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

function taskList(
  status: 'complete' | 'incomplete' | 'loading',
  id: string,
  title: string,
  tasks: readonly ReturnType<typeof taskItem>[],
): GoogleTaskListLoad {
  const common = { taskList: { id, title }, tasks };

  if (status === 'incomplete') {
    return { status, ...common, reason: 'forbidden' };
  }

  return status === 'complete' ? { status, ...common } : { status, ...common };
}

function taskItem(
  id: string,
  title: string,
  overrides: Partial<ReturnType<typeof completeTaskList>['tasks'][number]> = {},
) {
  return {
    id,
    title,
    position: id,
    status: 'needsAction' as const,
    deleted: false,
    hidden: false,
    assigned: false,
    ...overrides,
  };
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

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
import type { CompletedSession } from '../../src/timer/session';
import {
  cancelSession,
  finishSession,
  pauseSession,
  resumeSession,
} from '../../src/timer/transitions';

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
    expect(screen.getByRole('region', { name: 'Histórico' })).toHaveTextContent(
      'Revisar documento',
    );
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Finalizar sessão' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancelar sessão' })).toBeEnabled();
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
    expect(screen.getByText('Exibindo o último histórico local disponível.')).toBeVisible();
  });

  it('distingue histórico vazio de histórico indisponível', async () => {
    const emptyView = render(<App dependencies={createDependencies()} />);

    expect(await screen.findByText('Nenhuma sessão concluída neste perfil.')).toBeVisible();
    emptyView.unmount();

    render(
      <App
        dependencies={createDependencies({
          observeTimerState: (listener) => {
            listener({ status: 'invalid' });
            return () => {};
          },
        })}
      />,
    );

    expect(await screen.findByText('Histórico indisponível.')).toBeVisible();
  });

  it('apresenta snapshots históricos ordenados com intervalo, duração e fallbacks', async () => {
    const older = completedHistorySession('older', {
      task: { id: 'same-remote-task', title: '' },
      taskList: { id: 'old-list', title: '' },
      startedAtMs: new Date(2026, 7, 29, 23, 50).getTime(),
      endedAtMs: new Date(2026, 7, 30, 0, 20).getTime(),
      periods: [
        {
          startedAtMs: new Date(2026, 7, 29, 23, 50).getTime(),
          endedAtMs: new Date(2026, 7, 29, 23, 50).getTime(),
        },
      ],
      durationMs: 0,
    });
    const newer = completedHistorySession('newer', {
      task: { id: 'other-task', title: '<img src=x onerror=alert(1)>' },
      taskList: { id: 'other-list', title: '<script>lista</script>' },
      startedAtMs: new Date(2026, 7, 30, 14, 30).getTime(),
      endedAtMs: new Date(2026, 7, 30, 15, 15).getTime(),
      periods: [
        {
          startedAtMs: new Date(2026, 7, 30, 14, 30).getTime(),
          endedAtMs: new Date(2026, 7, 30, 15, 15).getTime(),
        },
      ],
      durationMs: 45 * 60_000,
    });
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      observeTimerState: observeReadyTimerState({
        activeSession: null,
        history: [older, newer],
      }),
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'complete',
        taskLists: [
          taskList('complete', 'current-list', 'Lista atual', [
            taskItem('same-remote-task', 'Título atual da API'),
          ]),
        ],
      }),
    });

    render(<App dependencies={dependencies} />);

    expect(await screen.findByText('Título atual da API')).toBeVisible();
    const history = screen.getByRole('region', { name: 'Histórico' });
    const items = within(history).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(items[0]).toHaveTextContent('<script>lista</script>');
    expect(items[0]).toHaveTextContent('30/08/2026 · 14:30–15:15');
    expect(items[0]).toHaveTextContent('Duração · 00:45:00');
    expect(items[1]).toHaveTextContent('Sem título');
    expect(items[1]).toHaveTextContent('Lista sem título');
    expect(items[1]).toHaveTextContent('29/08/2026 23:50 → 30/08/2026 00:20');
    expect(items[1]).toHaveTextContent('Duração · 00:00:00');
    expect(within(history).queryByText('Título atual da API')).not.toBeInTheDocument();
    expect(history.querySelector('img')).toBeNull();
    expect(history.querySelector('script')).toBeNull();
    expect(
      within(history).queryByRole('button', { name: /editar|excluir/i }),
    ).not.toBeInTheDocument();
  });

  it('mostra o histórico em lotes de 20 e reinicia o limite ao remontar', async () => {
    const history = Array.from({ length: 45 }, (_, index) =>
      completedHistorySession(`session-${index}`, {
        task: { id: `task-${index}`, title: `Sessão ${index}` },
        startedAtMs: index * 10_000,
        endedAtMs: index * 10_000 + 5_000,
        periods: [{ startedAtMs: index * 10_000, endedAtMs: index * 10_000 + 5_000 }],
      }),
    );
    const dependencies = createDependencies({
      observeTimerState: observeReadyTimerState({ activeSession: null, history }),
    });
    const view = render(<App dependencies={dependencies} />);
    const historyRegion = screen.getByRole('region', { name: 'Histórico' });

    expect(within(historyRegion).getAllByRole('listitem')).toHaveLength(20);
    expect(within(historyRegion).getByText('Sessão 44')).toBeVisible();
    expect(within(historyRegion).queryByText('Sessão 24')).not.toBeInTheDocument();

    fireEvent.click(within(historyRegion).getByRole('button', { name: 'Mostrar mais 20 sessões' }));
    expect(within(historyRegion).getAllByRole('listitem')).toHaveLength(40);
    fireEvent.click(within(historyRegion).getByRole('button', { name: 'Mostrar mais 20 sessões' }));
    expect(within(historyRegion).getAllByRole('listitem')).toHaveLength(45);
    expect(
      within(historyRegion).queryByRole('button', { name: 'Mostrar mais 20 sessões' }),
    ).not.toBeInTheDocument();

    view.unmount();
    render(<App dependencies={dependencies} />);
    expect(
      within(screen.getByRole('region', { name: 'Histórico' })).getAllByRole('listitem'),
    ).toHaveLength(20);
  });

  it('atualiza o histórico quando outra instância persiste uma sessão', () => {
    let notify: ((observation: StoredTimerStateObservation) => void) | undefined;
    const dependencies = createDependencies({
      observeTimerState: (listener) => {
        notify = listener;
        listener({ status: 'ready', value: EMPTY_TIMER_STATE });
        return () => {};
      },
    });

    render(<App dependencies={dependencies} />);
    expect(screen.getByText('Nenhuma sessão concluída neste perfil.')).toBeVisible();

    act(() =>
      notify?.({
        status: 'ready',
        value: {
          activeSession: null,
          history: [completedHistorySession('observed')],
        },
      }),
    );

    expect(screen.getByText('Tarefa observed')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Histórico' })).toHaveTextContent('1 sessão');
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
    expect(within(tasksRegion).getByRole('radio', { name: /Página disponível/ })).toBeEnabled();

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
    const taskChoices = within(tasksRegion).getByRole('group', { name: 'Escolha uma tarefa' });
    const groupHeadings = within(taskChoices).getAllByRole('heading', { level: 3 });
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

  it('seleciona uma tarefa por vez e persiste snapshots mínimos somente após confirmação', async () => {
    const startStoredSession = vi.fn<PopupDependencies['startStoredSession']>(
      async (_expected, input) => appliedStart(input),
    );
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      createSessionId: () => 'session-from-uuid',
      now: () => 42_000,
      startStoredSession,
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'complete',
        taskLists: [
          taskList('complete', 'list-selection', 'Trabalho', [
            taskItem('task-first', 'Primeira tarefa', { position: '0001' }),
            taskItem('task-second', 'Segunda tarefa', { position: '0002' }),
          ]),
        ],
      }),
    });

    render(<App dependencies={dependencies} />);

    const first = await screen.findByRole('radio', { name: /Primeira tarefa.*Trabalho.*Sem data/ });
    const second = screen.getByRole('radio', { name: /Segunda tarefa.*Trabalho.*Sem data/ });
    expect(screen.getByRole('group', { name: 'Escolha uma tarefa' })).toBeVisible();
    expect(startStoredSession).not.toHaveBeenCalled();

    fireEvent.click(first);
    expect(first).toBeChecked();
    expect(second).not.toBeChecked();
    expect(startStoredSession).not.toHaveBeenCalled();

    fireEvent.click(second);
    expect(first).not.toBeChecked();
    expect(second).toBeChecked();
    second.focus();
    expect(second).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sessão' }));

    expect(await screen.findByText('Próxima ação: Pausar.')).toBeVisible();
    expect(startStoredSession).toHaveBeenCalledOnce();
    expect(startStoredSession).toHaveBeenCalledWith(null, {
      id: 'session-from-uuid',
      task: { id: 'task-second', title: 'Segunda tarefa' },
      taskList: { id: 'list-selection', title: 'Trabalho' },
      startedAtMs: 42_000,
    });
    expect(
      screen.getByText('Finalize ou cancele a sessão atual antes de iniciar outra.'),
    ).toBeVisible();
    expect(second).toBeDisabled();
  });

  it('bloqueia cliques repetidos e não atualiza a árvore desmontada depois da escrita', async () => {
    const pendingStart =
      Promise.withResolvers<Awaited<ReturnType<PopupDependencies['startStoredSession']>>>();
    const startStoredSession = vi.fn<PopupDependencies['startStoredSession']>(
      () => pendingStart.promise,
    );
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      startStoredSession,
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'complete',
        taskLists: [completeTaskList()],
      }),
    });
    const view = render(<App dependencies={dependencies} />);

    fireEvent.click(await screen.findByRole('radio', { name: /Preparar relatório/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sessão' }));

    const starting = await screen.findByRole('button', { name: 'Iniciando…' });
    expect(starting).toBeDisabled();
    expect(starting).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(starting);
    expect(startStoredSession).toHaveBeenCalledOnce();

    view.unmount();
    const input = startStoredSession.mock.calls[0]?.[1];

    if (!input) {
      throw new Error('Expected a pending start input.');
    }

    pendingStart.resolve(appliedStart(input));
    await act(async () => Promise.resolve());
    expect(view.container).toBeEmptyDOMElement();
  });

  it('mantém a gravação em andamento quando a tarefa selecionada sai do catálogo', async () => {
    const pendingStart =
      Promise.withResolvers<Awaited<ReturnType<PopupDependencies['startStoredSession']>>>();
    const startStoredSession = vi.fn<PopupDependencies['startStoredSession']>(
      () => pendingStart.promise,
    );
    const loadTasksCatalog = vi
      .fn<PopupDependencies['loadTasksCatalog']>()
      .mockResolvedValueOnce({ status: 'complete', taskLists: [completeTaskList()] })
      .mockResolvedValueOnce({
        status: 'complete',
        taskLists: [
          taskList('complete', 'list-2', 'Pessoal', [taskItem('task-2', 'Outra tarefa')]),
        ],
      });
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      startStoredSession,
      loadTasksCatalog,
    });

    render(<App dependencies={dependencies} />);
    fireEvent.click(await screen.findByRole('radio', { name: /Preparar relatório/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sessão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar tarefas' }));

    expect(await screen.findByRole('radio', { name: /Outra tarefa/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Iniciando…' })).toBeDisabled();
    expect(startStoredSession).toHaveBeenCalledOnce();

    pendingStart.resolve({ status: 'failed', reason: 'storage-unavailable' });

    expect(await screen.findByText('Selecione uma tarefa para iniciar o timer.')).toBeVisible();
    expect(screen.getByRole('radio', { name: /Outra tarefa/ })).not.toBeChecked();
  });

  it('preserva a seleção e permite retry depois de falha de quota', async () => {
    const startStoredSession = vi
      .fn<PopupDependencies['startStoredSession']>()
      .mockResolvedValueOnce({ status: 'failed', reason: 'quota-exceeded' })
      .mockImplementationOnce(async (_expected, input) => appliedStart(input));
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      startStoredSession,
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'complete',
        taskLists: [completeTaskList()],
      }),
    });

    render(<App dependencies={dependencies} />);
    const task = await screen.findByRole('radio', { name: /Preparar relatório/ });
    fireEvent.click(task);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sessão' }));

    expect(
      await screen.findByText(
        'O armazenamento local está sem espaço. Libere espaço e tente novamente.',
      ),
    ).toBeVisible();
    expect(task).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar iniciar novamente' }));

    expect(await screen.findByText('Próxima ação: Pausar.')).toBeVisible();
    expect(startStoredSession).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ status: 'failed', reason: 'storage-unavailable' } as const],
    [{ status: 'rejected', reason: 'session-id-conflict' } as const],
  ])('sanitiza uma falha de início recuperável', async (result) => {
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      startStoredSession: vi.fn().mockResolvedValue(result),
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'complete',
        taskLists: [completeTaskList()],
      }),
    });

    render(<App dependencies={dependencies} />);
    fireEvent.click(await screen.findByRole('radio', { name: /Preparar relatório/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sessão' }));

    expect(
      await screen.findByText('Não foi possível salvar a sessão. Tente novamente.'),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(result.reason);
  });

  it('converge para a sessão concorrente retornada pela persistência', async () => {
    const concurrentState = activeTimerState();
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      startStoredSession: vi.fn().mockResolvedValue({
        status: 'conflict',
        reason: 'stale-state',
        state: concurrentState,
      }),
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'complete',
        taskLists: [completeTaskList()],
      }),
    });

    render(<App dependencies={dependencies} />);
    fireEvent.click(await screen.findByRole('radio', { name: /Preparar relatório/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sessão' }));

    expect(
      await screen.findByText('Finalize ou cancele a sessão atual antes de iniciar outra.'),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Sessão atual' })).toHaveTextContent(
      'Preparar relatório',
    );
    expect(document.body).not.toHaveTextContent('stale-state');
  });

  it('preserva a seleção por identidade e a remove quando a tarefa deixa o catálogo', async () => {
    const selected = taskItem('selected-task', 'Selecionada', { position: '0002' });
    const other = taskItem('other-task', 'Outra', { position: '0001' });
    const loadTasksCatalog = vi
      .fn<PopupDependencies['loadTasksCatalog']>()
      .mockResolvedValueOnce({
        status: 'complete',
        taskLists: [taskList('complete', 'stable-list', 'Trabalho', [other, selected])],
      })
      .mockResolvedValueOnce({
        status: 'complete',
        taskLists: [taskList('complete', 'stable-list', 'Trabalho', [selected, other])],
      })
      .mockResolvedValueOnce({
        status: 'complete',
        taskLists: [taskList('complete', 'stable-list', 'Trabalho', [other])],
      });
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      loadTasksCatalog,
    });

    render(<App dependencies={dependencies} />);
    const selectedRadio = await screen.findByRole('radio', { name: /Selecionada/ });
    fireEvent.click(selectedRadio);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar tarefas' }));

    await screen.findByRole('button', { name: 'Atualizar tarefas' });
    expect(await screen.findByRole('radio', { name: /Selecionada/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar tarefas' }));

    expect(await screen.findByText('Selecione uma tarefa para iniciar o timer.')).toBeVisible();
    expect(screen.queryByRole('radio', { name: /Selecionada/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar sessão' })).not.toBeInTheDocument();
  });

  it.each([
    [
      'carregando',
      () => () => {},
      'Aguarde a recuperação dos dados locais para selecionar uma tarefa.',
    ],
    [
      'indisponível',
      (listener: (observation: StoredTimerStateObservation) => void) => {
        listener({ status: 'failed', reason: 'storage-unavailable' });
        return () => {};
      },
      'Não foi possível confirmar os dados locais. Tente reabrir o popup.',
    ],
  ])('bloqueia seleção enquanto o armazenamento está %s', async (_name, observe, message) => {
    const dependencies = createDependencies({
      getAuthorization: authorized('token'),
      observeTimerState: observe,
      loadTasksCatalog: vi.fn().mockResolvedValue({
        status: 'complete',
        taskLists: [completeTaskList()],
      }),
    });

    render(<App dependencies={dependencies} />);

    const radio = await screen.findByRole('radio', { name: /Preparar relatório/ });
    expect(radio).toBeDisabled();
    expect(screen.getByText(message)).toBeVisible();
    fireEvent.click(radio);
    expect(screen.queryByRole('button', { name: 'Iniciar sessão' })).not.toBeInTheDocument();
  });

  it.each([
    ['running', activeTimerState(), 'Próxima ação: Pausar.', '00:00:05'],
    ['paused', pausedTimerState(), 'Próxima ação: Retomar.', '00:00:02'],
  ])(
    'recupera visualmente uma sessão %s e bloqueia outra seleção',
    async (_state, timer, action, duration) => {
      const dependencies = createDependencies({
        getAuthorization: authorized('token'),
        observeTimerState: observeReadyTimerState(timer),
        loadTasksCatalog: vi.fn().mockResolvedValue({
          status: 'complete',
          taskLists: [completeTaskList()],
        }),
      });

      render(<App dependencies={dependencies} />);

      expect(await screen.findByText(action)).toBeVisible();
      expect(screen.getByRole('region', { name: 'Sessão atual' })).toHaveTextContent(duration);
      expect(screen.getByRole('radio', { name: /Preparar relatório/ })).toBeDisabled();
      expect(
        screen.getByText('Finalize ou cancele a sessão atual antes de iniciar outra.'),
      ).toBeVisible();
    },
  );

  it('pausa e retoma usando a sessão observada e um timestamp por ação', async () => {
    let nowMs = NOW_MS;
    const pauseStoredSession = vi.fn<PopupDependencies['pauseStoredSession']>((expected, atMs) =>
      Promise.resolve(pauseSession(expected, atMs)),
    );
    const resumeStoredSession = vi.fn<PopupDependencies['resumeStoredSession']>((expected, atMs) =>
      Promise.resolve(resumeSession(expected, atMs)),
    );
    const dependencies = createDependencies({
      observeTimerState: observeReadyTimerState(activeTimerState()),
      pauseStoredSession,
      resumeStoredSession,
      now: () => nowMs,
    });

    render(<App dependencies={dependencies} />);
    const running = activeTimerState().activeSession;

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    expect(await screen.findByRole('button', { name: 'Retomar' })).toBeVisible();
    expect(pauseStoredSession).toHaveBeenCalledOnce();
    expect(pauseStoredSession).toHaveBeenCalledWith(running, NOW_MS);
    expect(screen.getByRole('region', { name: 'Sessão atual' })).toHaveTextContent('Pausada');

    nowMs += 2_000;
    const paused = pauseStoredSession.mock.results[0]?.value;
    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }));

    expect(await screen.findByRole('button', { name: 'Pausar' })).toBeVisible();
    expect(resumeStoredSession).toHaveBeenCalledOnce();
    await expect(paused).resolves.toMatchObject({ status: 'applied' });
    expect(resumeStoredSession.mock.calls[0]?.[1]).toBe(12_000);
  });

  it.each([
    ['em execução', activeTimerState()],
    ['pausada', pausedTimerState()],
  ])('finaliza uma sessão %s e acrescenta um único histórico', async (_name, timer) => {
    const finishStoredSession = vi.fn<PopupDependencies['finishStoredSession']>((expected, atMs) =>
      Promise.resolve(finishSession(expected, atMs)),
    );
    const dependencies = createDependencies({
      observeTimerState: observeReadyTimerState(timer),
      finishStoredSession,
    });

    render(<App dependencies={dependencies} />);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar sessão' }));

    expect(await screen.findByText('Sessão finalizada e salva no histórico.')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Sessão atual' })).toHaveTextContent(
      'Nenhuma sessão em andamento.',
    );
    expect(screen.getByRole('region', { name: 'Histórico' })).toHaveTextContent('2');
    expect(screen.getByRole('region', { name: 'Histórico' })).toHaveTextContent(
      'Preparar relatório',
    );
    expect(finishStoredSession).toHaveBeenCalledWith(timer.activeSession, NOW_MS);
  });

  it.each([
    ['com tempo', activeTimerState()],
    ['sem tempo', zeroDurationTimerState()],
  ])('cancela diretamente uma sessão %s sem criar histórico', async (_name, timer) => {
    const cancelStoredSession = vi.fn<PopupDependencies['cancelStoredSession']>((expected) =>
      Promise.resolve(cancelSession(expected)),
    );
    const dependencies = createDependencies({
      observeTimerState: observeReadyTimerState(timer),
      cancelStoredSession,
    });

    render(<App dependencies={dependencies} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar sessão' }));

    expect(
      await screen.findByText('Sessão cancelada. Nenhum tempo foi adicionado ao histórico.'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Histórico' })).toHaveTextContent('1');
    expect(cancelStoredSession).toHaveBeenCalledWith(timer.activeSession);
  });

  it('bloqueia todas as ações enquanto uma transição está sendo persistida', async () => {
    const pendingPause =
      Promise.withResolvers<Awaited<ReturnType<PopupDependencies['pauseStoredSession']>>>();
    const pauseStoredSession = vi.fn<PopupDependencies['pauseStoredSession']>(
      () => pendingPause.promise,
    );
    const finishStoredSession = vi.fn<PopupDependencies['finishStoredSession']>();
    const cancelStoredSession = vi.fn<PopupDependencies['cancelStoredSession']>();
    const dependencies = createDependencies({
      observeTimerState: observeReadyTimerState(activeTimerState()),
      pauseStoredSession,
      finishStoredSession,
      cancelStoredSession,
    });

    render(<App dependencies={dependencies} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    const pausing = await screen.findByRole('button', { name: 'Pausando…' });
    expect(pausing).toBeDisabled();
    expect(pausing).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Finalizar sessão' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar sessão' })).toBeDisabled();
    fireEvent.click(pausing);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar sessão' }));
    expect(pauseStoredSession).toHaveBeenCalledOnce();
    expect(finishStoredSession).not.toHaveBeenCalled();
    expect(cancelStoredSession).not.toHaveBeenCalled();

    const expected = activeTimerState().activeSession;

    if (expected?.state !== 'running') {
      throw new Error('Expected a running session.');
    }

    pendingPause.resolve(pauseSession(expected, NOW_MS));
    expect(await screen.findByRole('button', { name: 'Retomar' })).toBeVisible();
  });

  it('preserva a sessão e permite repetir uma ação após falha de quota', async () => {
    const pauseStoredSession = vi
      .fn<PopupDependencies['pauseStoredSession']>()
      .mockResolvedValueOnce({ status: 'failed', reason: 'quota-exceeded' })
      .mockImplementationOnce((expected, atMs) => Promise.resolve(pauseSession(expected, atMs)));
    const dependencies = createDependencies({
      observeTimerState: observeReadyTimerState(activeTimerState()),
      pauseStoredSession,
    });

    render(<App dependencies={dependencies} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    expect(
      await screen.findByText(
        'O armazenamento local está sem espaço. A sessão foi preservada; tente novamente.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    expect(await screen.findByRole('button', { name: 'Retomar' })).toBeVisible();
    expect(pauseStoredSession).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      { status: 'failed', reason: 'storage-unavailable' } as const,
      'Não foi possível confirmar a ação. A sessão foi preservada; tente novamente.',
    ],
    [
      { status: 'failed', reason: 'invalid-stored-data' } as const,
      'Os dados locais não puderam ser validados. Nenhuma alteração foi feita.',
    ],
    [
      { status: 'rejected', reason: 'timestamp-out-of-order' } as const,
      'A data e a hora do dispositivo não permitem registrar esta ação agora.',
    ],
  ])('apresenta falha local sanitizada sem alterar a sessão', async (result, message) => {
    const dependencies = createDependencies({
      observeTimerState: observeReadyTimerState(activeTimerState()),
      pauseStoredSession: vi.fn().mockResolvedValue(result),
    });

    render(<App dependencies={dependencies} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByRole('region', { name: 'Sessão atual' })).toHaveTextContent('Em execução');
    expect(document.body).not.toHaveTextContent(result.reason);
  });

  it('converge para uma alteração concorrente e informa o conflito', async () => {
    const latest = pausedTimerState();
    const dependencies = createDependencies({
      observeTimerState: observeReadyTimerState(activeTimerState()),
      pauseStoredSession: vi.fn().mockResolvedValue({
        status: 'conflict',
        reason: 'stale-state',
        state: latest,
      }),
    });

    render(<App dependencies={dependencies} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    expect(await screen.findByRole('button', { name: 'Retomar' })).toBeVisible();
    expect(
      screen.getByText(
        'A sessão foi atualizada em outra janela. O estado mais recente está sendo exibido.',
      ),
    ).toBeVisible();
  });

  it('reflete uma sessão alterada pelo observador sem reabrir o popup', async () => {
    let notify: ((observation: StoredTimerStateObservation) => void) | undefined;
    const dependencies = createDependencies({
      observeTimerState: (listener) => {
        notify = listener;
        listener({ status: 'ready', value: activeTimerState() });
        return () => {};
      },
    });

    render(<App dependencies={dependencies} />);
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeVisible();

    act(() => notify?.({ status: 'ready', value: pausedTimerState() }));

    expect(screen.getByRole('button', { name: 'Retomar' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Sessão atual' })).toHaveTextContent('Pausada');
  });

  it('trata finalização pendente sem duplicar duração ou total diário', async () => {
    const active = activeTimerState().activeSession;

    if (active?.state !== 'running') {
      throw new Error('Expected a running session.');
    }

    const completed = {
      id: active.id,
      task: active.task,
      taskList: active.taskList,
      startedAtMs: active.startedAtMs,
      endedAtMs: 8_000,
      periods: [{ startedAtMs: active.runningSinceMs, endedAtMs: 8_000 }],
      durationMs: 3_000,
    } as const;
    const pendingState = { activeSession: active, history: [completed] };
    const finishStoredSession = vi
      .fn<PopupDependencies['finishStoredSession']>()
      .mockResolvedValue({
        status: 'applied',
        value: completed,
      });
    const dependencies = createDependencies({
      observeTimerState: observeReadyTimerState(pendingState),
      finishStoredSession,
    });

    render(<App dependencies={dependencies} />);
    const session = screen.getByRole('region', { name: 'Sessão atual' });

    expect(session).toHaveTextContent('00:00:03');
    expect(session).toHaveTextContent('Finalização pendente');
    expect(screen.getByRole('region', { name: 'Total de hoje' })).toHaveTextContent('00:00:03');
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar sessão' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir finalização' }));

    expect(await screen.findByText('Sessão finalizada e salva no histórico.')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Histórico' })).toHaveTextContent('1');
    expect(finishStoredSession).toHaveBeenCalledWith(active, NOW_MS);
  });

  it('mantém a escrita após desmontar sem atualizar a árvore encerrada', async () => {
    const pendingCancel =
      Promise.withResolvers<Awaited<ReturnType<PopupDependencies['cancelStoredSession']>>>();
    const dependencies = createDependencies({
      observeTimerState: observeReadyTimerState(activeTimerState()),
      cancelStoredSession: vi.fn(() => pendingCancel.promise),
    });
    const view = render(<App dependencies={dependencies} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar sessão' }));
    await screen.findByRole('button', { name: 'Cancelando…' });
    view.unmount();
    pendingCancel.resolve({ status: 'applied', value: null });
    await act(async () => Promise.resolve());

    expect(view.container).toBeEmptyDOMElement();
  });

  it('bloqueia controles quando o estado local deixa de ser validável', () => {
    const dependencies = createDependencies({
      observeTimerState: (listener) => {
        listener({ status: 'ready', value: activeTimerState() });
        listener({ status: 'invalid' });
        return () => {};
      },
    });

    render(<App dependencies={dependencies} />);

    expect(screen.getByRole('button', { name: 'Pausar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalizar sessão' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar sessão' })).toBeDisabled();
    expect(
      screen.getByText('Os controles estão indisponíveis até os dados locais serem validados.'),
    ).toBeVisible();
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
    startStoredSession: vi.fn<PopupDependencies['startStoredSession']>((_expected, input) =>
      Promise.resolve({
        status: 'applied',
        value: {
          ...input,
          state: 'running',
          periods: [],
          runningSinceMs: input.startedAtMs,
        },
      }),
    ),
    pauseStoredSession: vi.fn<PopupDependencies['pauseStoredSession']>((expected, atMs) =>
      Promise.resolve(pauseSession(expected, atMs)),
    ),
    resumeStoredSession: vi.fn<PopupDependencies['resumeStoredSession']>((expected, atMs) =>
      Promise.resolve(resumeSession(expected, atMs)),
    ),
    finishStoredSession: vi.fn<PopupDependencies['finishStoredSession']>((expected, atMs) =>
      Promise.resolve(finishSession(expected, atMs)),
    ),
    cancelStoredSession: vi.fn<PopupDependencies['cancelStoredSession']>((expected) =>
      Promise.resolve(cancelSession(expected)),
    ),
    createSessionId: () => 'controlled-session-id',
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

function completedHistorySession(
  id: string,
  overrides: Partial<CompletedSession> = {},
): CompletedSession {
  const startedAtMs = 1_000;
  const endedAtMs = 3_000;

  return {
    id,
    task: { id: `task-${id}`, title: `Tarefa ${id}` },
    taskList: { id: 'list-1', title: 'Trabalho' },
    startedAtMs,
    endedAtMs,
    periods: [{ startedAtMs, endedAtMs }],
    durationMs: endedAtMs - startedAtMs,
    ...overrides,
  };
}

function pausedTimerState(): StoredTimerState {
  return {
    activeSession: {
      id: 'paused-session',
      state: 'paused',
      task: { id: 'task-1', title: 'Preparar relatório' },
      taskList: { id: 'list-1', title: 'Trabalho' },
      startedAtMs: 5_000,
      periods: [{ startedAtMs: 5_000, endedAtMs: 7_000 }],
    },
    history: activeTimerState().history,
  };
}

function zeroDurationTimerState(): StoredTimerState {
  const state = activeTimerState();

  if (state.activeSession?.state !== 'running') {
    throw new Error('Expected a running session.');
  }

  return {
    activeSession: {
      ...state.activeSession,
      startedAtMs: NOW_MS,
      runningSinceMs: NOW_MS,
    },
    history: state.history,
  };
}

function appliedStart(input: Parameters<PopupDependencies['startStoredSession']>[1]) {
  return {
    status: 'applied' as const,
    value: {
      ...input,
      state: 'running' as const,
      periods: [],
      runningSinceMs: input.startedAtMs,
    },
  };
}

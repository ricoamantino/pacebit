import { describe, expect, it } from 'vitest';
import type { ActiveSession, PausedSession, RunningSession } from '../../src/timer/session';
import {
  cancelSession,
  finishSession,
  pauseSession,
  resumeSession,
  type StartSessionInput,
  startSession,
} from '../../src/timer/transitions';

const startInput: StartSessionInput = {
  id: 'session-1',
  task: { id: 'task-1', title: 'Preparar relatório' },
  taskList: { id: 'list-1', title: 'Trabalho' },
  startedAtMs: 1_000,
};

function runningSession(overrides: Partial<RunningSession> = {}): RunningSession {
  return {
    ...startInput,
    state: 'running',
    periods: [],
    runningSinceMs: startInput.startedAtMs,
    ...overrides,
  };
}

function pausedSession(overrides: Partial<PausedSession> = {}): PausedSession {
  return {
    ...startInput,
    state: 'paused',
    periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
    ...overrides,
  };
}

describe('transições do timer', () => {
  it('inicia uma sessão somente quando não existe sessão ativa', () => {
    expect(startSession(null, startInput)).toEqual({
      status: 'applied',
      value: runningSession(),
    });

    expect(startSession(runningSession(), { ...startInput, id: 'session-2' })).toEqual({
      status: 'rejected',
      reason: 'active-session-exists',
    });
  });

  it('trata a repetição do mesmo início como intenção já satisfeita', () => {
    const current = pausedSession();

    expect(startSession(current, startInput)).toEqual({ status: 'unchanged', value: current });
  });

  it('pausa fechando exatamente o período corrente sem alterar a entrada', () => {
    const current = runningSession({
      periods: [{ startedAtMs: 1_000, endedAtMs: 2_000 }],
      runningSinceMs: 3_000,
    });
    const snapshot = structuredClone(current);

    expect(pauseSession(current, 5_000)).toEqual({
      status: 'applied',
      value: pausedSession({
        periods: [
          { startedAtMs: 1_000, endedAtMs: 2_000 },
          { startedAtMs: 3_000, endedAtMs: 5_000 },
        ],
      }),
    });
    expect(current).toEqual(snapshot);
  });

  it('não duplica períodos ao pausar repetidamente', () => {
    const current = pausedSession();

    expect(pauseSession(current, 3_000)).toEqual({ status: 'unchanged', value: current });
  });

  it('retoma preservando períodos fechados e não repete a intenção', () => {
    const current = pausedSession();
    const resumed = runningSession({ periods: current.periods, runningSinceMs: 3_000 });

    expect(resumeSession(current, 3_000)).toEqual({ status: 'applied', value: resumed });
    expect(resumeSession(resumed, 4_000)).toEqual({ status: 'unchanged', value: resumed });
  });

  it('finaliza em execução fechando o período corrente e somando somente execução', () => {
    const current = runningSession({
      periods: [
        { startedAtMs: 1_000, endedAtMs: 2_000 },
        { startedAtMs: 4_000, endedAtMs: 5_000 },
      ],
      runningSinceMs: 8_000,
    });

    expect(finishSession(current, 11_000)).toEqual({
      status: 'applied',
      value: {
        id: startInput.id,
        task: startInput.task,
        taskList: startInput.taskList,
        startedAtMs: 1_000,
        endedAtMs: 11_000,
        periods: [
          { startedAtMs: 1_000, endedAtMs: 2_000 },
          { startedAtMs: 4_000, endedAtMs: 5_000 },
          { startedAtMs: 8_000, endedAtMs: 11_000 },
        ],
        durationMs: 5_000,
      },
    });
  });

  it('finaliza pausada sem contar o intervalo até a ação', () => {
    expect(finishSession(pausedSession(), 8_000)).toMatchObject({
      status: 'applied',
      value: { endedAtMs: 8_000, durationMs: 1_000 },
    });
  });

  it('preserva duração zero em uma sessão finalizada imediatamente', () => {
    expect(finishSession(runningSession(), 1_000)).toMatchObject({
      status: 'applied',
      value: {
        periods: [{ startedAtMs: 1_000, endedAtMs: 1_000 }],
        durationMs: 0,
      },
    });
  });

  it('produz o mesmo resultado ao repetir exatamente o comando de finalização', () => {
    const current = runningSession();

    expect(finishSession(current, 2_000)).toEqual(finishSession(current, 2_000));
  });

  it('cancela sem produzir histórico e torna a repetição inócua', () => {
    expect(cancelSession(runningSession())).toEqual({ status: 'applied', value: null });
    expect(cancelSession(pausedSession())).toEqual({ status: 'applied', value: null });
    expect(cancelSession(null)).toEqual({ status: 'unchanged', value: null });
  });

  it('rejeita ações que exigem uma sessão ativa quando ela está ausente', () => {
    const rejection = { status: 'rejected', reason: 'no-active-session' };

    expect(pauseSession(null, 1_000)).toEqual(rejection);
    expect(resumeSession(null, 1_000)).toEqual(rejection);
    expect(finishSession(null, 1_000)).toEqual(rejection);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, -1, 1.5])(
    'rejeita o timestamp inválido %s',
    (timestampMs) => {
      expect(startSession(null, { ...startInput, startedAtMs: timestampMs })).toEqual({
        status: 'rejected',
        reason: 'invalid-timestamp',
      });
      expect(pauseSession(runningSession(), timestampMs)).toEqual({
        status: 'rejected',
        reason: 'invalid-timestamp',
      });
    },
  );

  it('rejeita regressão temporal sem modificar a sessão', () => {
    const running = runningSession({ runningSinceMs: 3_000 });
    const paused = pausedSession();
    const runningSnapshot: ActiveSession = structuredClone(running);
    const pausedSnapshot: ActiveSession = structuredClone(paused);

    expect(pauseSession(running, 2_999)).toEqual({
      status: 'rejected',
      reason: 'timestamp-out-of-order',
    });
    expect(resumeSession(paused, 1_999)).toEqual({
      status: 'rejected',
      reason: 'timestamp-out-of-order',
    });
    expect(finishSession(running, 2_999)).toEqual({
      status: 'rejected',
      reason: 'timestamp-out-of-order',
    });
    expect(finishSession(paused, 1_999)).toEqual({
      status: 'rejected',
      reason: 'timestamp-out-of-order',
    });
    expect(running).toEqual(runningSnapshot);
    expect(paused).toEqual(pausedSnapshot);
  });
});

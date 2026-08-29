import { afterAll, describe, expect, it } from 'vitest';
import {
  compareCivilDates,
  getLocalCivilDate,
  parseScheduledDate,
} from '../../src/tasks/scheduled-date';

const originalTimeZone = process.env.TZ;

describe.sequential('data agendada do Google Tasks', () => {
  afterAll(() => {
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  });

  it('extrai somente a data civil de valores simples e RFC 3339', () => {
    expect(parseScheduledDate('2026-08-29')).toEqual({ year: 2026, month: 8, day: 29 });
    expect(parseScheduledDate('2026-08-29T23:45:12.345-03:00')).toEqual({
      year: 2026,
      month: 8,
      day: 29,
    });
  });

  it('não altera a data agendada quando o fuso local muda', () => {
    process.env.TZ = 'UTC';
    const utcDate = parseScheduledDate('2026-08-29T00:00:00.000Z');
    process.env.TZ = 'America/Sao_Paulo';
    const saoPauloDate = parseScheduledDate('2026-08-29T00:00:00.000Z');

    expect(utcDate).toEqual({ year: 2026, month: 8, day: 29 });
    expect(saoPauloDate).toEqual(utcDate);
  });

  it('aceita anos bissextos e rejeita datas ou formatos inválidos', () => {
    expect(parseScheduledDate('2024-02-29T00:00:00Z')).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
    expect(parseScheduledDate('2025-02-29T00:00:00Z')).toBeNull();
    expect(parseScheduledDate('2026-13-01')).toBeNull();
    expect(parseScheduledDate('2026-08-29T25:00:00Z')).toBeNull();
    expect(parseScheduledDate('2026-08-29 qualquer coisa')).toBeNull();
    expect(parseScheduledDate(null)).toBeNull();
    expect(parseScheduledDate(undefined)).toBeNull();
  });

  it('lê hoje no fuso local separadamente da data agendada', () => {
    const timestampMs = Date.parse('2026-08-29T02:30:00Z');

    process.env.TZ = 'UTC';
    expect(getLocalCivilDate(timestampMs)).toEqual({ year: 2026, month: 8, day: 29 });
    process.env.TZ = 'America/Sao_Paulo';
    expect(getLocalCivilDate(timestampMs)).toEqual({ year: 2026, month: 8, day: 28 });
  });

  it('compara datas civis sem considerar horário ou fuso', () => {
    expect(
      compareCivilDates({ year: 2026, month: 8, day: 28 }, { year: 2026, month: 8, day: 29 }),
    ).toBe(-1);
    expect(
      compareCivilDates({ year: 2026, month: 8, day: 29 }, { year: 2026, month: 8, day: 29 }),
    ).toBe(0);
    expect(
      compareCivilDates({ year: 2026, month: 8, day: 30 }, { year: 2026, month: 8, day: 29 }),
    ).toBe(1);
  });
});

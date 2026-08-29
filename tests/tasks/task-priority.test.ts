import { describe, expect, it } from 'vitest';
import type { GoogleTaskItem } from '../../src/google/tasks';
import type { GoogleTaskListLoad } from '../../src/google/tasks-catalog';
import { prioritizeGoogleTasks } from '../../src/tasks/task-priority';

const TODAY = { year: 2026, month: 8, day: 29 } as const;

describe('task priority', () => {
  it('orders every group and scheduled date by the product priority', () => {
    const result = prioritizeGoogleTasks(
      [
        loadedList('complete', 'list-1', [
          task('future-later', '2026-09-02'),
          task('undated'),
          task('today', '2026-08-29'),
          task('overdue-recent', '2026-08-28'),
          task('future-near', '2026-08-30'),
          task('overdue-old', '2026-08-01'),
        ]),
      ],
      TODAY,
    );

    expect(result.map(({ task: item, group }) => [item.id, group])).toEqual([
      ['overdue-old', 'overdue'],
      ['overdue-recent', 'overdue'],
      ['today', 'today'],
      ['undated', 'undated'],
      ['future-near', 'future'],
      ['future-later', 'future'],
    ]);
  });

  it('breaks ties by list order, position and id without locale-dependent comparison', () => {
    const result = prioritizeGoogleTasks(
      [
        loadedList('complete', 'first-list', [
          task('z-id', '2026-08-29', '0002'),
          task('b-id', '2026-08-29', '0001'),
          task('a-id', '2026-08-29', '0001'),
        ]),
        loadedList('incomplete', 'second-list', [task('first-position', '2026-08-29', '0000')]),
      ],
      TODAY,
    );

    expect(result.map(({ task: item }) => item.id)).toEqual([
      'a-id',
      'b-id',
      'z-id',
      'first-position',
    ]);
  });

  it('includes loading and incomplete lists, keeps subtasks independent and ignores pending lists', () => {
    const child = { ...task('child'), parentId: 'parent' };
    const result = prioritizeGoogleTasks(
      [
        loadingList('loading-list', [child]),
        loadedList('incomplete', 'incomplete-list', [task('incomplete')]),
        { status: 'pending', taskList: { id: 'pending-list', title: 'Pending' } },
      ],
      TODAY,
    );

    expect(result.map(({ task: item, taskList }) => [item.id, taskList.id])).toEqual([
      ['child', 'loading-list'],
      ['incomplete', 'incomplete-list'],
    ]);
    expect(result[0]?.task.parentId).toBe('parent');
  });

  it('keeps the relative order of known tasks when a new page adds other priorities', () => {
    const firstPage = loadingList('list', [
      task('today-b', '2026-08-29', '0002'),
      task('future', '2026-09-01', '0001'),
    ]);
    const before = prioritizeGoogleTasks([firstPage], TODAY).map(({ task: item }) => item.id);
    const after = prioritizeGoogleTasks(
      [
        loadingList('list', [
          ...firstPage.tasks,
          task('overdue', '2026-08-01', '0003'),
          task('today-a', '2026-08-29', '0001'),
        ]),
      ],
      TODAY,
    ).map(({ task: item }) => item.id);

    expect(before).toEqual(['today-b', 'future']);
    expect(after).toEqual(['overdue', 'today-a', 'today-b', 'future']);
    expect(after.filter((id) => before.includes(id))).toEqual(before);
  });
});

function loadedList(
  status: 'complete' | 'incomplete',
  id: string,
  tasks: readonly GoogleTaskItem[],
): GoogleTaskListLoad {
  return status === 'incomplete'
    ? { status, taskList: { id, title: id }, tasks, reason: 'forbidden' }
    : { status, taskList: { id, title: id }, tasks };
}

function loadingList(
  id: string,
  tasks: readonly GoogleTaskItem[],
): Extract<GoogleTaskListLoad, { readonly status: 'loading' }> {
  return { status: 'loading', taskList: { id, title: id }, tasks };
}

function task(id: string, due?: string, position = id): GoogleTaskItem {
  return {
    id,
    title: id,
    position,
    status: 'needsAction',
    ...(due ? { due } : {}),
    deleted: false,
    hidden: false,
    assigned: false,
  };
}

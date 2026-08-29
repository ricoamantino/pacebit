import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../entrypoints/popup/App';

describe('App', () => {
  it('apresenta a identificação inicial do Pacebit', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Pacebit' })).toBeInTheDocument();
    expect(screen.getByText('Acompanhe o tempo dedicado às suas tarefas.')).toBeInTheDocument();
  });
});

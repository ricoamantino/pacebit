import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Pacebit',
    description: 'Registre o tempo gasto em tarefas do Google Tasks.',
    action: {
      default_title: 'Pacebit',
    },
  },
});

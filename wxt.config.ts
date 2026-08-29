import { defineConfig } from 'wxt';

const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
const GOOGLE_TASKS_HOST = 'https://tasks.googleapis.com/*';
const CHROME_EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtJrVomQPGXCz45jwDz16D96e6xgyjFMtigxu2P60TKpV+Olt3CvQ5yhTBvpS5oi2z3bxnhYbQRtOfx1XbfNHUnCXfEGPzRJYUijIUQEGVlmzMFXq2cxOiZi2Xw3KcR8WA6ooSYj0wxxxGJkDn4OJSk+ASDdiDVAQnF5bTx7hCSBfk2UOiuGUsmN22DFA4UPVyIz1xQMJd+mxiXnZUdE219y6bRfjQ/OhBv/36PlOzq057zk6Oj3OTMJjF8SWvNz/ZKnhm5TQLsbiMxM6uN1JP4/C4IyCUPUvAvJouplJzfzxHDNxioqoblPGW6zbea9zBObbUbAhObuW0/C8+/C6JQIDAQAB';
const GOOGLE_OAUTH_CLIENT_ID_PATTERN = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
const isPrepareCommand = process.argv.includes('prepare');

function getGoogleOAuthClientId(): string | undefined {
  const clientId = import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID;

  if (isPrepareCommand && (clientId === undefined || clientId.length === 0)) {
    return undefined;
  }

  if (
    clientId === undefined ||
    clientId.length === 0 ||
    clientId !== clientId.trim() ||
    !GOOGLE_OAUTH_CLIENT_ID_PATTERN.test(clientId)
  ) {
    throw new Error(
      'Configure WXT_GOOGLE_OAUTH_CLIENT_ID with a valid Chrome Extension OAuth client ID.',
    );
  }

  return clientId;
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: () => {
    const googleOAuthClientId = getGoogleOAuthClientId();

    return {
      name: 'Pacebit',
      description: 'Registre o tempo gasto em tarefas do Google Tasks.',
      minimum_chrome_version: '106',
      action: {
        default_title: 'Pacebit',
      },
      permissions: ['identity', 'storage'],
      host_permissions: [GOOGLE_TASKS_HOST],
      key: CHROME_EXTENSION_PUBLIC_KEY,
      ...(googleOAuthClientId === undefined
        ? {}
        : {
            oauth2: {
              client_id: googleOAuthClientId,
              scopes: [GOOGLE_TASKS_SCOPE],
            },
          }),
      incognito: 'not_allowed',
    };
  },
});

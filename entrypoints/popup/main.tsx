import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Popup root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

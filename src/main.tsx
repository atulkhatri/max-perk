import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { App } from './App';
import { APP_NAME } from './strings';

document.title = APP_NAME;

if (import.meta.env.DEV) {
  void import('./data/seeds/catalog').then(({ catalog, validateCatalog }) => {
    const errors = validateCatalog(catalog);
    if (errors.length > 0) {
      console.error('Catalog validation failed:', errors);
    }
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

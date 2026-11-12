import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../../src/styles/golden-layout.css';
import '../themes/dark.css';
import '../themes/light.css';
import '../themes/soda.css';
import '../themes/translucent.css';
import './demo.css';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

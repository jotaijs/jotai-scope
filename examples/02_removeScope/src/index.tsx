import { createRoot } from 'react-dom/client';

import App from './App';

const ele = document.getElementById('app');
if (ele) {
  createRoot(ele).render(<App />);
}

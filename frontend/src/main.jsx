import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyFavicon } from './components/brand';
import './index.css';

applyFavicon();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './desktop-glass.css';
import './app-transparency.css';
import './spotlight.css';
import './brand.css';
import './window-motion.css';
import './window-maximize.css';

createRoot(document.getElementById('root')!).render(<App />);

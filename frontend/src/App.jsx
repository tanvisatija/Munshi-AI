import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AppProvider } from './AppContext';
import Layout from './components/Layout';
import Splash3D from './components/splash3d/Splash3D';
import { Toasts } from './components/ui';
import ActionsLog from './pages/ActionsLog';
import AlertDetail from './pages/AlertDetail';
import AlertsPage from './pages/AlertsPage';
import Dashboard from './pages/Dashboard';
import MerchantSelect from './pages/MerchantSelect';
import Profile from './pages/Profile';

export default function App() {
  // Splash state lives here, above the router: it shows once per page load (a reload shows it
  // again) and route changes never bring it back. 'show' -> 'leaving' (cross-fade) -> 'done'.
  const [splash, setSplash] = useState('show');

  return (
    <MotionConfig reducedMotion="user">
      <AppProvider>
        <BrowserRouter>
          {/* The app mounts as the splash starts fading, so the cross-fade reveals its entrance. */}
          {splash !== 'show' && (
            <Routes>
              <Route path="/" element={<MerchantSelect />} />
              <Route path="/m/:mid" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="alerts" element={<AlertsPage />} />
                <Route path="alerts/:sid" element={<AlertDetail />} />
                <Route path="actions" element={<ActionsLog />} />
                <Route path="profile" element={<Profile />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
          <Toasts />
        </BrowserRouter>
        {splash !== 'done' && <Splash3D onLeaving={() => setSplash('leaving')} onDone={() => setSplash('done')} />}
      </AppProvider>
    </MotionConfig>
  );
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { ToastProvider } from './components/Toast';
import { SSEProvider } from './context/SSEContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Attendance from './pages/Attendance';
import PersonReport from './pages/PersonReport';
import Projects from './pages/Projects';
import Timings from './pages/Timings';
import Team from './pages/Team';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Reports from './pages/Reports';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 28 28" fill="none" style={{ margin: '0 auto 12px' }}>
            <rect width="28" height="28" rx="8" fill="#1D9E75" />
            <rect x="6" y="18" width="4" height="6" rx="1" fill="white" opacity="0.9" />
            <rect x="12" y="13" width="4" height="11" rx="1" fill="white" />
            <rect x="18" y="8" width="4" height="16" rx="1" fill="white" opacity="0.75" />
          </svg>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
        </div>
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Overview />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/person" element={<PersonReport />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/timings" element={<Timings />} />
        <Route path="/team" element={<Team />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <SettingsProvider>
          <AuthProvider>
            <SSEProvider>
              <ToastProvider>
                <AppRoutes />
              </ToastProvider>
            </SSEProvider>
          </AuthProvider>
        </SettingsProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

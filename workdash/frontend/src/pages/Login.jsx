import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { appName, appSubtitle, logoUrl } = useSettings();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f1923] to-[#1a2d40]">
      <div className="w-full max-w-sm">

        {/* Logo + App Name */}
        <div className="text-center mb-8">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                style={{ height: 56, width: 'auto', maxWidth: 180, objectFit: 'contain' }}
              />
            ) : (
              <svg width="52" height="52" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="8" fill="#1D9E75" />
                <rect x="6" y="18" width="4" height="6" rx="1" fill="white" opacity="0.9" />
                <rect x="12" y="13" width="4" height="11" rx="1" fill="white" />
                <rect x="18" y="8" width="4" height="16" rx="1" fill="white" opacity="0.75" />
              </svg>
            )}
          </div>
          <h1 className="text-white text-2xl font-bold">{appName}</h1>
          <p className="text-white/50 text-sm mt-1">{appSubtitle}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-gray-800 font-bold text-xl mb-6">Sign in to continue</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75] focus:border-transparent transition"
                placeholder="admin"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75] focus:border-transparent transition"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1D9E75] hover:bg-[#0F6E56] text-white font-semibold py-2.5 rounded-lg transition-colors mt-2 disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          {appName} · Admin Access
        </p>
      </div>
    </div>
  );
}

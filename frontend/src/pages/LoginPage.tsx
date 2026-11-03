import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, Mail, ArrowRight, AlertCircle, KeyRound, UserCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
  };

  return (
    <div className="min-h-screen bg-[#070B13] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-xl shadow-emerald-500/20 mb-4">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          Trust<span className="text-emerald-400">Vault</span>
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          The document platform where the wrong person can never read the file, and you can prove who read it.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#0F172A] py-8 px-6 shadow-2xl rounded-2xl border border-gray-800 sm:px-10">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@trustvault.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In to Vault'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick-select seed accounts */}
          <div className="mt-8 pt-6 border-t border-gray-800">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
              1-Click Demo Accounts
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@trustvault.com', 'Admin@123456')}
                className="p-2 text-left bg-gray-900/80 hover:bg-gray-800 border border-purple-900/40 hover:border-purple-500 rounded-xl transition-all"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                  <UserCheck className="w-3.5 h-3.5" />
                  Admin
                </div>
                <div className="text-[11px] text-gray-400 truncate">admin@trustvault.com</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('owner@trustvault.com', 'Owner@123456')}
                className="p-2 text-left bg-gray-900/80 hover:bg-gray-800 border border-emerald-900/40 hover:border-emerald-500 rounded-xl transition-all"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                  <UserCheck className="w-3.5 h-3.5" />
                  Owner 1
                </div>
                <div className="text-[11px] text-gray-400 truncate">owner@trustvault.com</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('owner2@trustvault.com', 'Owner2@123456')}
                className="p-2 text-left bg-gray-900/80 hover:bg-gray-800 border border-emerald-900/40 hover:border-emerald-500 rounded-xl transition-all"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                  <UserCheck className="w-3.5 h-3.5" />
                  Owner 2
                </div>
                <div className="text-[11px] text-gray-400 truncate">owner2@trustvault.com</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('viewer@trustvault.com', 'Viewer@123456')}
                className="p-2 text-left bg-gray-900/80 hover:bg-gray-800 border border-blue-900/40 hover:border-blue-500 rounded-xl transition-all"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
                  <UserCheck className="w-3.5 h-3.5" />
                  Viewer 1
                </div>
                <div className="text-[11px] text-gray-400 truncate">viewer@trustvault.com</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('viewer2@trustvault.com', 'Viewer2@123456')}
                className="col-span-2 p-2 text-left bg-gray-900/80 hover:bg-gray-800 border border-blue-900/40 hover:border-blue-500 rounded-xl transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
                    <UserCheck className="w-3.5 h-3.5" />
                    Viewer 2 (Unshared by default)
                  </div>
                  <span className="text-[10px] text-gray-500">viewer2@trustvault.com</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

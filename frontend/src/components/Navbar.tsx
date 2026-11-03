import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, FileText, Activity, Users, LogOut } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab }) => {
  const { user, logout } = useAuth();

  if (!user) return null;

  const roleBadgeColor = {
    admin: 'bg-purple-900/60 text-purple-300 border-purple-500/40',
    owner: 'bg-emerald-900/60 text-emerald-300 border-emerald-500/40',
    viewer: 'bg-blue-900/60 text-blue-300 border-blue-500/40',
  }[user.role];

  return (
    <header className="border-b border-gray-800 bg-[#0F172A]/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                Trust<span className="text-emerald-400">Vault</span>
              </span>
              <span className="text-[10px] text-gray-400 block -mt-1 tracking-wider uppercase font-semibold">
                Cryptographic Evidence Platform
              </span>
            </div>
          </div>

          <nav className="flex space-x-1 sm:space-x-2">
            <button
              onClick={() => setCurrentTab('documents')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'documents'
                  ? 'bg-gray-800 text-white border border-gray-700'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              Documents
            </button>

            {user.role === 'admin' && (
              <>
                <button
                  onClick={() => setCurrentTab('audit')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentTab === 'audit'
                      ? 'bg-gray-800 text-white border border-gray-700'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`}
                >
                  <Activity className="w-4 h-4 text-purple-400" />
                  Audit Trail
                </button>
                <button
                  onClick={() => setCurrentTab('admin')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentTab === 'admin'
                      ? 'bg-gray-800 text-white border border-gray-700'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`}
                >
                  <Users className="w-4 h-4 text-blue-400" />
                  Admin Console
                </button>
              </>
            )}
          </nav>

          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-gray-200">{user.name}</div>
              <div className="text-xs text-gray-400">{user.email}</div>
            </div>

            <span
              className={`px-2.5 py-1 text-xs font-semibold rounded-full border uppercase tracking-wider ${roleBadgeColor}`}
            >
              {user.role}
            </span>

            <button
              onClick={() => logout()}
              title="Sign Out"
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors border border-transparent hover:border-red-900/50"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

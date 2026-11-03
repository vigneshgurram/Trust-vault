import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { User, AdminStats } from '../types';
import { 
  Users, Shield, FileText, Activity, 
  CheckCircle2, XCircle, Power 
} from 'lucide-react';

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);

  const loadData = async () => {
    try {
      const [usersData, statsData] = await Promise.all([
        api.listUsers(),
        api.getAdminStats(),
      ]);
      setUsers(usersData);
      setStats(statsData);
    } catch (err: any) {
      alert(`Failed to load admin data: ${err.message}`);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleUserStatus = async (user: User) => {
    const action = user.isActive ? 'disable' : 'enable';
    if (!confirm(`Are you sure you want to ${action} ${user.name}'s account? Disabling takes effect immediately.`)) {
      return;
    }
    try {
      await api.updateUserStatus(user.id, !user.isActive);
      await loadData();
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="pb-6 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-400" />
          System Administration & Oversight
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Monitor vault health, manage security identities, and immediately lock out accounts.
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#0F172A] border border-gray-800">
            <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
              <span>Identities</span>
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">{stats.totalUsers}</div>
            <div className="text-xs text-emerald-400 mt-1">{stats.activeUsers} Active Accounts</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#0F172A] border border-gray-800">
            <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
              <span>Encrypted Docs</span>
              <FileText className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">{stats.totalDocuments}</div>
            <div className="text-xs text-gray-400 mt-1">AES-256-GCM At-Rest</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#0F172A] border border-gray-800">
            <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
              <span>Active Grants</span>
              <Shield className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">{stats.activePermissions}</div>
            <div className="text-xs text-gray-400 mt-1">Explicit ACL Rules</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#0F172A] border border-gray-800">
            <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
              <span>24h Actions</span>
              <Activity className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">{stats.last24hActions}</div>
            <div className="text-xs text-gray-400 mt-1">HMAC-Signed Events</div>
          </div>
        </div>
      )}

      {/* Users Management Table */}
      <div className="bg-[#0F172A] border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              User Access Management
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Toggling account status immediately revokes token authentication on all subsequent requests.
            </p>
          </div>
        </div>

        <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/40">
          <table className="min-w-full divide-y divide-gray-800 text-left text-xs">
            <thead className="bg-gray-900/60 text-[11px] uppercase font-semibold text-gray-400 tracking-wider">
              <tr>
                <th scope="col" className="px-5 py-3">User</th>
                <th scope="col" className="px-5 py-3">Role</th>
                <th scope="col" className="px-5 py-3">Status</th>
                <th scope="col" className="px-5 py-3">Created</th>
                <th scope="col" className="px-5 py-3 text-right">Lockout Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/80">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-white">{u.name}</div>
                    <div className="text-[11px] text-gray-400">{u.email}</div>
                  </td>

                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                        u.role === 'admin'
                          ? 'bg-purple-950/70 text-purple-300 border border-purple-800/80'
                          : u.role === 'owner'
                          ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/80'
                          : 'bg-blue-950/70 text-blue-300 border border-blue-800/80'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>

                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {u.isActive ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                        <XCircle className="w-3.5 h-3.5" />
                        Locked Out
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3.5 whitespace-nowrap text-gray-400">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>

                  <td className="px-5 py-3.5 whitespace-nowrap text-right">
                    <button
                      onClick={() => toggleUserStatus(u)}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        u.isActive
                          ? 'text-red-400 hover:text-white bg-red-950/40 hover:bg-red-900/60 border border-red-900/60'
                          : 'text-emerald-400 hover:text-white bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-900/60'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      {u.isActive ? 'Disable User' : 'Enable User'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

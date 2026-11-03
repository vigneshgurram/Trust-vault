import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { AuditLog, AuditVerifyResult } from '../types';
import { 
  ShieldCheck, ShieldAlert, RefreshCw, Filter, 
  Terminal 
} from 'lucide-react';

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.listAuditLogs({ action: actionFilter || undefined, limit: 100 });
      setLogs(res.logs);
      setTotal(res.pagination.total);
    } catch (err: any) {
      alert(`Failed to load audit logs: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await api.verifyAuditChain();
      setVerifyResult(res);
      // reload logs after verification log entry added
      await fetchLogs();
    } catch (err: any) {
      alert(`Verification error: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    handleVerify();
  }, [actionFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header and Verification Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Terminal className="w-6 h-6 text-purple-400" />
            Immutable Audit Trail
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Every file view, download, permission grant, and revocation is mathematically chained with HMAC-SHA256.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-purple-600/25 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`} />
            {verifying ? 'Verifying Hashes...' : 'Verify HMAC Blockchain'}
          </button>
        </div>
      </div>

      {/* Verification Banner */}
      {verifyResult && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all ${
            verifyResult.valid
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
              : 'bg-red-950/60 border-red-800 text-red-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {verifyResult.valid ? (
              <ShieldCheck className="w-7 h-7 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-7 h-7 text-red-400 shrink-0" />
            )}
            <div>
              <div className="text-sm font-bold flex items-center gap-2">
                {verifyResult.valid ? 'Cryptographic Chain Integrity Verified' : 'CRITICAL: Audit Tamper Detected!'}
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-black/40">
                  {verifyResult.totalEntries} Records Audited
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-0.5">{verifyResult.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Filter */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All Actions ({total})</option>
            <option value="UPLOAD">UPLOAD</option>
            <option value="DOWNLOAD">DOWNLOAD</option>
            <option value="VIEW">VIEW</option>
            <option value="EDIT">EDIT</option>
            <option value="DELETE">DELETE</option>
            <option value="PERMISSION_GRANT">PERMISSION_GRANT</option>
            <option value="PERMISSION_REVOKE">PERMISSION_REVOKE</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGIN_FAILED">LOGIN_FAILED</option>
            <option value="CHAIN_VERIFIED">CHAIN_VERIFIED</option>
          </select>
        </div>

        <span className="text-xs text-gray-400 font-mono">
          Showing latest {logs.length} of {total} records
        </span>
      </div>

      {/* Logs Table */}
      <div className="border border-gray-800 rounded-2xl overflow-hidden bg-[#0F172A]">
        {loading ? (
          <div className="py-20 text-center text-gray-400">Loading audit log entries...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800 text-left text-xs">
              <thead className="bg-gray-900/60 text-[11px] uppercase font-semibold text-gray-400 tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3 font-mono">Seq #</th>
                  <th scope="col" className="px-4 py-3">Timestamp</th>
                  <th scope="col" className="px-4 py-3">Action</th>
                  <th scope="col" className="px-4 py-3">Actor</th>
                  <th scope="col" className="px-4 py-3">Target Details</th>
                  <th scope="col" className="px-4 py-3 font-mono">HMAC-SHA256 Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80 font-sans">
                {logs.map((log) => {
                  let detailsObj: any = null;
                  try {
                    if (log.details) detailsObj = JSON.parse(log.details);
                  } catch {
                    // ignore
                  }

                  const actionColor = {
                    DOWNLOAD: 'text-emerald-400 bg-emerald-950/60 border-emerald-900/50',
                    UPLOAD: 'text-blue-400 bg-blue-950/60 border-blue-900/50',
                    PERMISSION_GRANT: 'text-amber-400 bg-amber-950/60 border-amber-900/50',
                    PERMISSION_REVOKE: 'text-red-400 bg-red-950/60 border-red-900/50',
                    LOGIN_FAILED: 'text-red-300 bg-red-950/80 border-red-800',
                    CHAIN_VERIFIED: 'text-purple-400 bg-purple-950/60 border-purple-900/50',
                  }[log.action] || 'text-gray-300 bg-gray-800 border-gray-700';

                  return (
                    <tr key={log.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-purple-400 font-bold">
                        #{log.sequenceNumber}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-gray-400">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${actionColor}`}>
                          {log.action}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-200">
                          {log.user?.name || (log.userId ? log.userId.slice(0, 8) : 'Anonymous')}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {log.user?.email || log.ipAddress || ''}
                        </div>
                      </td>

                      <td className="px-4 py-3 max-w-xs truncate text-gray-300">
                        {detailsObj ? (
                          <span title={JSON.stringify(detailsObj, null, 2)}>
                            {detailsObj.title || detailsObj.documentTitle || detailsObj.email || detailsObj.filename || JSON.stringify(detailsObj)}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-gray-400">
                        <span className="bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800 text-gray-400 select-all" title={log.entryHash}>
                          {log.entryHash.slice(0, 16)}...
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

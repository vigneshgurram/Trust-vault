import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { DocumentItem, DocumentPermission, AuditLog, User, PermissionLevel } from '../types';
import { 
  ArrowLeft, Download, Shield, UserPlus, 
  Trash2, Edit3, Save, 
  AlertCircle, History, Clock 
} from 'lucide-react';

interface DocumentDetailPageProps {
  documentId: string;
  onBack: () => void;
}

export const DocumentDetailPage: React.FC<DocumentDetailPageProps> = ({ documentId, onBack }) => {
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [permissions, setPermissions] = useState<DocumentPermission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit metadata state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Grant permission state
  const [grantUserId, setGrantUserId] = useState('');
  const [grantLevel, setGrantLevel] = useState<PermissionLevel>('READ');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const isOwner = user && doc && user.id === doc.ownerId;
  const canEdit = isOwner || permissions.some(p => p.userId === user?.id && p.permissionLevel === 'EDIT' && !p.revokedAt);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const docData = await api.getDocument(documentId);
      setDoc(docData);
      setEditTitle(docData.title);
      setEditCategory(docData.category || '');
      setEditDesc(docData.description || '');

      // Load permissions if owner or admin
      if (user && (user.id === docData.ownerId || user.role === 'admin')) {
        const perms = await api.listPermissions(documentId);
        setPermissions(perms);

        const logs = await api.getDocumentAudit(documentId);
        setAuditLogs(logs);

        const usersList = await api.listUsers().catch(() => []);
        setAllUsers(usersList.filter(u => u.id !== docData.ownerId));
      }
    } catch (err: any) {
      setError(err.message || 'Access denied or document not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [documentId]);

  const handleSaveMetadata = async () => {
    setSaving(true);
    try {
      const updated = await api.updateDocument(documentId, {
        title: editTitle,
        category: editCategory,
        description: editDesc,
      });
      setDoc(updated);
      setEditing(false);
      // Reload audit
      if (isOwner || user?.role === 'admin') {
        const logs = await api.getDocumentAudit(documentId);
        setAuditLogs(logs);
      }
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantUserId) return;
    setGranting(true);
    setGrantError(null);
    try {
      await api.grantPermission(documentId, grantUserId, grantLevel);
      setGrantUserId('');
      // Reload permissions and audit
      const perms = await api.listPermissions(documentId);
      setPermissions(perms);
      const logs = await api.getDocumentAudit(documentId);
      setAuditLogs(logs);
    } catch (err: any) {
      setGrantError(err.message || 'Failed to grant permission');
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (permId: string, userName: string) => {
    if (!confirm(`Revoke access for ${userName} immediately? They will lose all ability to download or view this document.`)) {
      return;
    }
    try {
      await api.revokePermission(documentId, permId);
      // Reload permissions and audit
      const perms = await api.listPermissions(documentId);
      setPermissions(perms);
      const logs = await api.getDocumentAudit(documentId);
      setAuditLogs(logs);
    } catch (err: any) {
      alert(`Revocation failed: ${err.message}`);
    }
  };

  const handleDownload = async () => {
    if (!doc) return;
    try {
      await api.downloadDocument(doc.id, doc.originalFilename);
    } catch (err: any) {
      alert(`Download refused: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center text-gray-400">
        Authenticating & loading document securely...
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="p-6 bg-red-950/40 border border-red-800/80 rounded-2xl text-red-200">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold">Access Refused (404)</h2>
          <p className="text-sm text-gray-300 mt-2">
            The server refused access to this document. Either it does not exist, or you were not explicitly granted permission.
          </p>
          <button
            onClick={onBack}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Documents
          </button>
        </div>
      </div>
    );
  }

  const activePermissions = permissions.filter(p => !p.revokedAt);
  const revokedPermissions = permissions.filter(p => p.revokedAt);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back button & Action buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Documents
        </button>

        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-600/25 transition-all"
        >
          <Download className="w-4 h-4" />
          Download Decrypted File
        </button>
      </div>

      {/* Main Document Details Card */}
      <div className="bg-[#0F172A] border border-gray-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-gray-800">
          <div className="flex-1">
            {editing ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-xl font-bold bg-gray-900 border border-gray-700 rounded-xl px-3 py-1.5 text-white"
                />
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="Category"
                  className="w-full text-sm bg-gray-900 border border-gray-700 rounded-xl px-3 py-1.5 text-gray-200"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">{doc.title}</h1>
                  {doc.category && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-emerald-400 border border-gray-700">
                      {doc.category}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1 flex items-center gap-4">
                  <span>Owner: <strong className="text-gray-200">{doc.owner.name}</strong> ({doc.owner.email})</span>
                  <span>•</span>
                  <span>Uploaded: {new Date(doc.createdAt).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          {canEdit && (
            <div>
              {editing ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveMetadata}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium border border-gray-700"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Metadata
                </button>
              )}
            </div>
          )}
        </div>

        {/* Security Parameters & Description */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Description & Notes
            </h4>
            {editing ? (
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                className="w-full text-sm bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white"
              />
            ) : (
              <p className="text-sm text-gray-300 bg-gray-900/60 p-3.5 rounded-xl border border-gray-800 min-h-[5rem]">
                {doc.description || 'No description provided.'}
              </p>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Cryptographic Parameters
            </h4>
            <div className="bg-gray-900/60 p-3.5 rounded-xl border border-gray-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-gray-500">File Name:</span>
                <span className="text-gray-300 truncate max-w-xs">{doc.originalFilename}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">File Size:</span>
                <span className="text-gray-300">{(doc.fileSize / 1024).toFixed(2)} KB ({doc.fileSize} bytes)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cipher:</span>
                <span className="text-emerald-400 font-bold">AES-256-GCM (Authenticated)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">SHA-256 Plaintext Hash:</span>
                <span className="text-gray-300 truncate max-w-[200px]" title={doc.checksum}>{doc.checksum}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Access Control List (Owner / Admin view) */}
      {(isOwner || user?.role === 'admin') && (
        <div className="bg-[#0F172A] border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-400" />
                Access Control List (ACL)
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Per-document explicit grants. No folder inheritance. Revocation takes effect on the next request.
              </p>
            </div>
            <div className="px-3 py-1 bg-emerald-950/60 border border-emerald-800/80 rounded-full text-xs text-emerald-400 font-semibold">
              {activePermissions.length} Active {activePermissions.length === 1 ? 'Grant' : 'Grants'}
            </div>
          </div>

          {/* Grant Access Form */}
          {isOwner && (
            <form onSubmit={handleGrant} className="bg-gray-900/60 p-4 rounded-xl border border-gray-800">
              <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                Grant Access to a Named User
              </div>

              {grantError && (
                <div className="mb-3 p-2.5 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{grantError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <select
                    value={grantUserId}
                    onChange={(e) => setGrantUserId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select a user...</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email} - {u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={grantLevel}
                    onChange={(e) => setGrantLevel(e.target.value as PermissionLevel)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="READ">READ (Download & View)</option>
                    <option value="EDIT">EDIT (Download, View & Update Title/Notes)</option>
                  </select>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={granting || !grantUserId}
                    className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    {granting ? 'Granting...' : 'Confirm Grant'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Active Grants List */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Active Grants
            </h4>
            {activePermissions.length === 0 ? (
              <div className="text-xs text-gray-500 italic p-3 bg-gray-900/30 rounded-xl">
                No active grants. Only you (the document owner) can read or download this file.
              </div>
            ) : (
              <div className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden bg-gray-900/40">
                {activePermissions.map((perm) => (
                  <div key={perm.id} className="p-3.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center font-bold text-gray-300">
                        {perm.user?.name.slice(0, 2).toUpperCase() || 'U'}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{perm.user?.name}</div>
                        <div className="text-gray-400">{perm.user?.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                        perm.permissionLevel === 'EDIT'
                          ? 'bg-amber-950/70 text-amber-300 border border-amber-800/80'
                          : 'bg-blue-950/70 text-blue-300 border border-blue-800/80'
                      }`}>
                        {perm.permissionLevel}
                      </span>

                      <span className="text-gray-500 text-[11px] hidden sm:inline">
                        Granted {new Date(perm.grantedAt).toLocaleDateString()}
                      </span>

                      {isOwner && (
                        <button
                          onClick={() => handleRevoke(perm.id, perm.user?.name || 'this user')}
                          title="Revoke access immediately"
                          className="flex items-center gap-1 px-2.5 py-1 text-red-400 hover:text-white bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 rounded-lg transition-colors font-medium text-[11px]"
                        >
                          <Trash2 className="w-3 h-3" />
                          Revoke Access
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Revocation History */}
          {revokedPermissions.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Revocation History ({revokedPermissions.length})
              </h4>
              <div className="divide-y divide-gray-800/50 border border-gray-800/50 rounded-xl overflow-hidden bg-gray-900/20 text-xs">
                {revokedPermissions.map((perm) => (
                  <div key={perm.id} className="p-2.5 px-4 flex items-center justify-between text-gray-500">
                    <div>
                      <span className="line-through font-medium text-gray-400">{perm.user?.name}</span>
                      <span className="ml-2 text-[11px]">({perm.user?.email})</span>
                    </div>
                    <div className="text-[11px]">
                      Access revoked at {new Date(perm.revokedAt!).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Document Specific Audit Trail */}
      {(isOwner || user?.role === 'admin') && (
        <div className="bg-[#0F172A] border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-purple-400" />
              Document Audit Evidence
            </h3>
            <span className="text-xs text-gray-400">
              {auditLogs.length} Cryptographically Chained Records
            </span>
          </div>

          <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/40">
            <div className="divide-y divide-gray-800/80">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-purple-400 text-[11px] bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-900/50">
                      #{log.sequenceNumber}
                    </span>
                    <span className="font-bold text-white uppercase tracking-wider text-[11px] bg-gray-800 px-2 py-0.5 rounded">
                      {log.action}
                    </span>
                    <span className="text-gray-300">
                      by <strong>{log.user?.name || 'System / Anonymous'}</strong>
                    </span>
                    <span className="text-gray-500 text-[11px] hidden md:inline">
                      ({log.user?.email || 'N/A'})
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-gray-400 text-[11px]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-500" />
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <span className="font-mono text-gray-500 truncate max-w-[100px]" title={log.entryHash}>
                      HMAC: {log.entryHash.slice(0, 10)}...
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { DocumentItem } from '../types';
import { 
  FileText, Upload, Search, Download, Trash2, 
  ExternalLink, Calendar, Lock, AlertCircle, 
  Plus, X, Filter 
} from 'lucide-react';

interface DocumentsPageProps {
  onSelectDocument: (docId: string) => void;
}

export const DocumentsPage: React.FC<DocumentsPageProps> = ({ onSelectDocument }) => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listDocuments({ search, category: category || undefined });
      setDocuments(res.documents);

      // Collect unique categories
      const cats = Array.from(
        new Set(res.documents.map((d) => d.category).filter(Boolean) as string[])
      );
      setCategories(cats);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [category]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDocs();
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select a file');
      return;
    }

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', uploadTitle || uploadFile.name);
    if (uploadCategory) formData.append('category', uploadCategory);
    if (uploadDesc) formData.append('description', uploadDesc);

    try {
      await api.uploadDocument(formData);
      setShowUpload(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadCategory('');
      setUploadDesc('');
      await fetchDocs();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.downloadDocument(doc.id, doc.originalFilename);
    } catch (err: any) {
      alert(`Download refused: ${err.message}`);
    }
  };

  const handleDelete = async (doc: DocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to soft-delete "${doc.title}"? Access for all granted users will be revoked immediately.`)) {
      return;
    }
    try {
      await api.deleteDocument(doc.id);
      await fetchDocs();
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    }
  };

  const canUpload = user && (user.role === 'owner' || user.role === 'admin');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Lock className="w-6 h-6 text-emerald-400" />
            Document Vault
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {user?.role === 'admin'
              ? 'Admin view: System-wide metadata monitoring. Content retrieval is strictly audited and subject to ACL.'
              : user?.role === 'owner'
              ? 'Documents you own or have explicit grants for. You can issue or immediately revoke access.'
              : 'Secure read-only view. Only documents explicitly granted to you are visible.'}
          </p>
        </div>

        {canUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm shadow-lg shadow-emerald-600/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            Upload Document
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, description or filename..."
            className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </form>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Documents Table / Grid */}
      <div className="mt-6">
        {loading ? (
          <div className="py-20 text-center text-gray-400">Loading vault documents...</div>
        ) : documents.length === 0 ? (
          <div className="py-20 text-center bg-gray-900/40 rounded-2xl border border-gray-800 p-8">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-300">No accessible documents found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {search
                ? 'No documents matched your query.'
                : 'You have not uploaded any files, and no document has been granted to your account.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden border border-gray-800 rounded-2xl bg-[#0F172A]">
            <table className="min-w-full divide-y divide-gray-800 text-left text-sm">
              <thead className="bg-gray-900/60 text-xs uppercase font-semibold text-gray-400 tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Document</th>
                  <th scope="col" className="px-6 py-3.5">Category</th>
                  <th scope="col" className="px-6 py-3.5">Owner</th>
                  <th scope="col" className="px-6 py-3.5">Size</th>
                  <th scope="col" className="px-6 py-3.5">Uploaded</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80">
                {documents.map((doc) => {
                  const isOwner = user?.id === doc.ownerId;
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => onSelectDocument(doc.id)}
                      className="hover:bg-gray-800/50 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 border border-gray-700">
                            <FileText className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div>
                            <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
                              {doc.title}
                            </div>
                            <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                              <span>{doc.originalFilename}</span>
                              <span className="text-emerald-500/80 font-mono text-[10px] bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-900/50">
                                AES-256-GCM
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {doc.category ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-300 border border-gray-700">
                            {doc.category}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-gray-200 text-xs font-medium">
                          {isOwner ? (
                            <span className="text-emerald-400 font-semibold">You ({doc.owner.name})</span>
                          ) : (
                            doc.owner.name
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400">{doc.owner.email}</div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                        {(doc.fileSize / 1024).toFixed(1)} KB
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 flex items-center gap-1.5 pt-5">
                        <Calendar className="w-3.5 h-3.5 text-gray-500" />
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => handleDownload(doc, e)}
                            title="Download Decrypted File"
                            className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-950/40 rounded-lg transition-colors border border-transparent hover:border-emerald-800/40"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {(isOwner || user?.role === 'admin') && (
                            <button
                              onClick={(e) => handleDelete(doc, e)}
                              title="Soft-delete document & revoke all access"
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors border border-transparent hover:border-red-800/40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => onSelectDocument(doc.id)}
                            title="Open Details & Permissions"
                            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-950/40 rounded-lg transition-colors border border-transparent hover:border-blue-800/40"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-gray-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                Upload to TrustVault
              </h3>
              <button
                onClick={() => setShowUpload(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadError && (
              <div className="mt-4 p-3 bg-red-950/50 border border-red-800 text-red-200 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
                  File Selection *
                </label>
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setUploadFile(file);
                    if (file && !uploadTitle) setUploadTitle(file.name);
                  }}
                  required
                  className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-950 file:text-emerald-300 hover:file:bg-emerald-900 border border-gray-800 rounded-xl p-2 bg-gray-900"
                />
                <span className="text-[11px] text-gray-500 mt-1 block">
                  Encrypted client-to-disk with AES-256-GCM. Max 50MB.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  required
                  placeholder="e.g., Executive Compensation Q4"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  placeholder="e.g., Finance, Legal, HR, Audit"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
                  Description / Confidentiality Notes
                </label>
                <textarea
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  rows={3}
                  placeholder="Confidential notes or context..."
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {uploading ? 'Encrypting & Storing...' : 'Upload & Encrypt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

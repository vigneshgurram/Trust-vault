import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentDetailPage } from './pages/DocumentDetailPage';
import { AuditPage } from './pages/AuditPage';
import { AdminPage } from './pages/AdminPage';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState('documents');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070B13] flex items-center justify-center text-gray-400">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-4 h-4 bg-emerald-500 rounded-full animate-ping" />
          <span>Verifying cryptographic credentials...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const handleSelectDocument = (docId: string) => {
    setSelectedDocId(docId);
  };

  const handleBackToDocuments = () => {
    setSelectedDocId(null);
  };

  const handleTabChange = (tab: string) => {
    setSelectedDocId(null);
    setCurrentTab(tab);
  };

  return (
    <div className="min-h-screen bg-[#070B13] text-gray-100 flex flex-col font-sans">
      <Navbar currentTab={currentTab} setCurrentTab={handleTabChange} />

      <main className="flex-1">
        {selectedDocId ? (
          <DocumentDetailPage documentId={selectedDocId} onBack={handleBackToDocuments} />
        ) : (
          <>
            {currentTab === 'documents' && <DocumentsPage onSelectDocument={handleSelectDocument} />}
            {currentTab === 'audit' && user.role === 'admin' && <AuditPage />}
            {currentTab === 'admin' && user.role === 'admin' && <AdminPage />}
          </>
        )}
      </main>

      <footer className="border-t border-gray-900 bg-[#070B13] py-4 text-center text-xs text-gray-500">
        TrustVault Platform • AES-256-GCM Encrypted Storage • HMAC-SHA256 Chained Audit Trail
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;

import { DocumentItem, AuditLog, AuditVerifyResult, AdminStats, User, PermissionLevel } from './types';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('tv_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    ...getAuthHeader(),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('tv_token');
    localStorage.removeItem('tv_user');
    window.dispatchEvent(new Event('auth:unauthorized'));
  }

  if (!res.ok) {
    let errMessage = 'Request failed';
    try {
      const errData = await res.json();
      errMessage = errData.error || errData.message || errMessage;
    } catch {
      // fallback
    }
    throw new Error(errMessage);
  }

  return res.json();
}

export const api = {
  // Auth
  async login(email: string, password: string) {
    return request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  },

  async logout() {
    return request<{ message: string }>('/auth/logout', { method: 'POST' });
  },

  async getMe() {
    return request<User>('/auth/me');
  },

  // Documents
  async listDocuments(params: {
    search?: string;
    category?: string;
    owner?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.category) query.append('category', params.category);
    if (params.owner) query.append('owner', params.owner);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());

    return request<{
      documents: DocumentItem[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/documents?${query.toString()}`);
  },

  async getDocument(id: string) {
    return request<DocumentItem>(`/documents/${id}`);
  },

  async uploadDocument(formData: FormData) {
    const headers = getAuthHeader();
    const res = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json() as Promise<DocumentItem>;
  },

  async updateDocument(id: string, updates: { title?: string; description?: string; category?: string }) {
    return request<DocumentItem>(`/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  async deleteDocument(id: string) {
    return request<{ message: string }>(`/documents/${id}`, {
      method: 'DELETE',
    });
  },

  async downloadDocument(id: string, filename: string) {
    const headers = getAuthHeader();
    const res = await fetch(`${API_BASE}/documents/${id}/download`, {
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Download failed');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // Permissions
  async listPermissions(docId: string) {
    return request<any[]>(`/documents/${docId}/permissions`);
  },

  async grantPermission(docId: string, userId: string, permissionLevel: PermissionLevel) {
    return request<any>(`/documents/${docId}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, permissionLevel }),
    });
  },

  async revokePermission(docId: string, permId: string) {
    return request<{ message: string }>(`/documents/${docId}/permissions/${permId}`, {
      method: 'DELETE',
    });
  },

  // Audit
  async listAuditLogs(params: {
    action?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const query = new URLSearchParams();
    if (params.action) query.append('action', params.action);
    if (params.userId) query.append('userId', params.userId);
    if (params.resourceType) query.append('resourceType', params.resourceType);
    if (params.resourceId) query.append('resourceId', params.resourceId);
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());

    return request<{
      logs: AuditLog[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/audit?${query.toString()}`);
  },

  async getDocumentAudit(docId: string) {
    return request<AuditLog[]>(`/audit/document/${docId}`);
  },

  async verifyAuditChain() {
    return request<AuditVerifyResult>('/audit/verify');
  },

  // Admin
  async getAdminStats() {
    return request<AdminStats>('/admin/stats');
  },

  async listUsers() {
    return request<User[]>('/users');
  },

  async updateUserStatus(userId: string, isActive: boolean) {
    return request<User>(`/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
  },
};

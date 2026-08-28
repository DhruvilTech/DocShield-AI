// src/lib/api/document.api.ts
import { apiClient } from './client';
import { VaultDocument, DocumentVersion } from '../../types';

export interface DocumentListParams {
  search?: string;
  documentType?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export const documentApi = {
  async getDocuments(params?: DocumentListParams): Promise<{ data: VaultDocument[]; pagination: any }> {
    const res = await apiClient<{ success: boolean; data: VaultDocument[]; pagination: any }>('/documents', {
      params,
    });
    return { data: res.data || [], pagination: res.pagination };
  },

  async getDocument(id: string): Promise<VaultDocument> {
    const res = await apiClient<{ success: boolean; data: { document: VaultDocument } }>(`/documents/${id}`);
    return res.data.document;
  },

  async uploadDocument(file: File, name?: string, documentType?: string, description?: string): Promise<VaultDocument> {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    if (documentType) formData.append('documentType', documentType);
    if (description) formData.append('description', description);

    const res = await apiClient<{ success: boolean; data: { document: VaultDocument } }>('/documents', {
      method: 'POST',
      body: formData,
    });
    return res.data.document;
  },

  async updateMetadata(id: string, data: { name?: string; documentType?: string; description?: string; status?: string }): Promise<VaultDocument> {
    const res = await apiClient<{ success: boolean; data: { document: VaultDocument } }>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.data.document;
  },

  async uploadNewVersion(id: string, file: File): Promise<VaultDocument> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await apiClient<{ success: boolean; data: { document: VaultDocument } }>(`/documents/${id}/versions`, {
      method: 'POST',
      body: formData,
    });
    return res.data.document;
  },

  async getVersions(id: string): Promise<DocumentVersion[]> {
    const res = await apiClient<{ success: boolean; data: { versions: DocumentVersion[] } }>(`/documents/${id}/versions`);
    return res.data.versions || [];
  },

  async downloadDocument(id: string, filename = 'document'): Promise<void> {
    const blob = await apiClient<Blob>(`/documents/${id}/download`, { isBlob: true });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  async downloadVersion(id: string, versionNumber: number, filename = 'document_v'): Promise<void> {
    const blob = await apiClient<Blob>(`/documents/${id}/versions/${versionNumber}/download`, { isBlob: true });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  async previewDocument(id: string): Promise<string> {
    const blob = await apiClient<Blob>(`/documents/${id}/preview`, { isBlob: true });
    return window.URL.createObjectURL(blob);
  },

  async deleteDocument(id: string): Promise<void> {
    await apiClient(`/documents/${id}`, { method: 'DELETE' });
  },
};

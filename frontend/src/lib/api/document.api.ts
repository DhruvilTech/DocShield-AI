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

export interface UploadDocumentOptions {
  name?: string;
  documentType?: string;
  description?: string;
}

export const documentApi = {
  async getDocuments(params?: DocumentListParams): Promise<{ data: VaultDocument[]; pagination: any }> {
    const res = await apiClient<{ success: boolean; data: VaultDocument[]; pagination: any }>('/documents', {
      params,
    });
    return { data: res.data || [], pagination: res.pagination };
  },

  async listDocuments(params?: DocumentListParams): Promise<{ data: VaultDocument[]; pagination: any }> {
    return this.getDocuments(params);
  },

  async getDocument(id: string): Promise<VaultDocument> {
    const res = await apiClient<{ success: boolean; data: { document: VaultDocument } }>(`/documents/${id}`);
    return (res.data as any)?.document || res.data;
  },

  async uploadDocument(
    file: File,
    nameOrOptions?: string | UploadDocumentOptions,
    documentType?: string,
    description?: string
  ): Promise<VaultDocument> {
    const formData = new FormData();
    formData.append('file', file);

    if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
      if (nameOrOptions.name) formData.append('name', nameOrOptions.name);
      if (nameOrOptions.documentType) formData.append('documentType', nameOrOptions.documentType);
      if (nameOrOptions.description) formData.append('description', nameOrOptions.description);
    } else {
      if (nameOrOptions) formData.append('name', nameOrOptions);
      if (documentType) formData.append('documentType', documentType);
      if (description) formData.append('description', description);
    }

    const res = await apiClient<{ success: boolean; data: { document: VaultDocument } }>('/documents', {
      method: 'POST',
      body: formData,
    });
    return (res.data as any)?.document || res.data;
  },

  async updateMetadata(id: string, data: { name?: string; documentType?: string; description?: string; status?: string }): Promise<VaultDocument> {
    const res = await apiClient<{ success: boolean; data: { document: VaultDocument } }>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return (res.data as any)?.document || res.data;
  },

  async uploadNewVersion(id: string, file: File): Promise<VaultDocument> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await apiClient<{ success: boolean; data: { document: VaultDocument } }>(`/documents/${id}/versions`, {
      method: 'POST',
      body: formData,
    });
    return (res.data as any)?.document || res.data;
  },

  async getVersions(id: string): Promise<DocumentVersion[]> {
    const res = await apiClient<{ success: boolean; data: { versions: DocumentVersion[] } }>(`/documents/${id}/versions`);
    return (res.data as any)?.versions || res.data || [];
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

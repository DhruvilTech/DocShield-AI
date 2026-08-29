// src/lib/api/watchlist.api.ts
import { apiClient } from './client';
import { WatchlistEntry } from '../../types';

export interface CreateWatchlistParams {
  documentNumber: string;
  fullName?: string;
  nationality?: string;
  reason: string;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  listedBy?: string;
  metadata?: Record<string, any>;
}

export interface WatchlistQueryParams {
  search?: string;
  page?: number;
  limit?: number;
}

export const watchlistApi = {
  /**
   * List watchlists with search & pagination
   */
  listWatchlists: async (params: WatchlistQueryParams = {}): Promise<{ data: WatchlistEntry[]; total: number }> => {
    const res = await apiClient.get<WatchlistEntry[]>('/watchlists', { params });
    return {
      data: res.data || [],
      total: res.pagination?.total || (res.data ? res.data.length : 0),
    };
  },

  /**
   * Register a new travel document or person alert
   */
  createWatchlistEntry: async (data: CreateWatchlistParams): Promise<WatchlistEntry> => {
    const res = await apiClient.post<WatchlistEntry>('/watchlists', data);
    return res.data;
  },

  /**
   * Deactivate watchlist entry
   */
  deleteWatchlistEntry: async (id: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete<{ success: boolean; message: string }>(`/watchlists/${id}`);
    return res.data;
  },
};

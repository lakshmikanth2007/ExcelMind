import { apiRequest } from './client';
import { QueryResponse, ChartData } from './types';

export interface SendQueryPayload {
  question: string;
  sheet?: string;
  session_id?: string;
  chart?: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'none';
}

export async function sendNaturalLanguageQuery(
  fileId: string,
  payload: SendQueryPayload,
  signal?: AbortSignal
): Promise<QueryResponse> {
  return apiRequest<QueryResponse>(`/files/${fileId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
}

export async function updateChartType(
  fileId: string,
  resultId: string,
  chartType: string,
  x?: string,
  y?: string
): Promise<{ status: string; chart: ChartData }> {
  return apiRequest(`/files/${fileId}/results/${resultId}/chart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chart_type: chartType, x, y }),
  });
}

export async function fetchSessionHistory(sessionId: string): Promise<any> {
  return apiRequest(`/sessions/${sessionId}/history`);
}

export async function clearSessionHistory(sessionId: string): Promise<any> {
  return apiRequest(`/sessions/${sessionId}`, { method: 'DELETE' });
}

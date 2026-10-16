import { apiRequest } from './client';
import { PreviewResponse, SheetProfile, UploadResponse, InsightReport, FileHistoryItem } from './types';

export async function uploadSpreadsheet(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  return apiRequest<UploadResponse>('/files', {
    method: 'POST',
    body: formData,
  });
}

export async function loadSampleSpreadsheet(sampleName: string): Promise<UploadResponse> {
  return apiRequest<UploadResponse>(`/files/sample/${sampleName}`, {
    method: 'POST',
  });
}

export async function createNewSpreadsheet(name?: string, template: string = 'blank'): Promise<UploadResponse> {
  const params = new URLSearchParams();
  if (name) params.append('name', name);
  params.append('template', template);
  return apiRequest<UploadResponse>(`/files/new?${params.toString()}`, {
    method: 'POST',
  });
}

export async function listUserFiles(): Promise<{ files: FileHistoryItem[] }> {
  return apiRequest<{ files: FileHistoryItem[] }>('/files');
}

export async function revertSpreadsheet(
  fileId: string,
  sheet?: string
): Promise<{ file_id: string; filename: string; is_temp_modified: boolean; sheet: string; profile: SheetProfile; message: string }> {
  const param = sheet ? `?sheet=${encodeURIComponent(sheet)}` : '';
  return apiRequest(`/files/${fileId}/revert${param}`, {
    method: 'POST',
  });
}

export async function fetchSheets(fileId: string): Promise<{
  file_id: string;
  filename?: string;
  sheets: Array<{ name: string; row_count: number; column_count: number }>;
  is_temp_modified?: boolean;
}> {
  return apiRequest(`/files/${fileId}/sheets`);
}

export async function fetchSchema(
  fileId: string,
  sheet?: string
): Promise<{
  file_id: string;
  filename?: string;
  sheet: string;
  profile: SheetProfile;
  is_temp_modified?: boolean;
  modifications_count?: number;
}> {
  const param = sheet ? `?sheet=${encodeURIComponent(sheet)}` : '';
  return apiRequest(`/files/${fileId}/schema${param}`);
}

export async function fetchPreview(
  fileId: string,
  sheet?: string,
  page: number = 1,
  pageSize: number = 50
): Promise<PreviewResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (sheet) params.append('sheet', sheet);

  return apiRequest<PreviewResponse>(`/files/${fileId}/preview?${params.toString()}`);
}

export async function searchSpreadsheet(
  fileId: string,
  query: string,
  sheet?: string,
  column?: string,
  page: number = 1
): Promise<any> {
  const params = new URLSearchParams({
    q: query,
    page: page.toString(),
  });
  if (sheet) params.append('sheet', sheet);
  if (column) params.append('column', column);

  return apiRequest(`/files/${fileId}/search?${params.toString()}`);
}

export async function fetchInsights(fileId: string, sheet?: string): Promise<InsightReport> {
  const param = sheet ? `?sheet=${encodeURIComponent(sheet)}` : '';
  return apiRequest<InsightReport>(`/files/${fileId}/insights${param}`);
}

export async function deleteSpreadsheet(fileId: string): Promise<{ status: string }> {
  return apiRequest<{ status: string }>(`/files/${fileId}`, {
    method: 'DELETE',
  });
}

export function getExportUrl(
  fileId: string,
  sheet?: string,
  format: 'csv' | 'xlsx' = 'xlsx',
  source: 'temp' | 'main' = 'temp'
): string {
  const params = new URLSearchParams({ format, source });
  if (sheet) params.append('sheet', sheet);
  return `/api/v1/files/${fileId}/export?${params.toString()}`;
}

export function getResultExportUrl(fileId: string, resultId: string, format: 'csv' | 'xlsx' = 'csv'): string {
  return `/api/v1/files/${fileId}/results/${resultId}/export?format=${format}`;
}

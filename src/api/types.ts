export interface ColumnProfile {
  name: string;
  original_name: string;
  dtype: 'integer' | 'float' | 'currency' | 'percent' | 'date' | 'datetime' | 'boolean' | 'text' | 'categorical' | 'id-like';
  null_count: number;
  null_pct: number;
  unique_count: number;
  min?: number | string | null;
  max?: number | string | null;
  mean?: number | null;
  top_values: any[];
  sample_values: any[];
}

export interface QualitySummary {
  has_empty_cells: boolean;
  empty_cells_count: number;
  duplicate_rows_count: number;
  duplicate_rows: number[];
  mixed_types: Array<{
    column: string;
    offending_rows: number[];
    sample_values: string[];
  }>;
  ambiguous_date_columns: string[];
  outlier_columns: Record<string, number[]>;
}

export interface SheetProfile {
  sheet_name: string;
  row_count: number;
  column_count: number;
  header_row: number;
  columns: ColumnProfile[];
  warnings: string[];
  quality: QualitySummary;
}

export interface FileHistoryItem {
  file_id: string;
  filename: string;
  file_type: string;
  file_size?: number;
  created_at: number;
  last_accessed_at: number;
  is_temp_modified?: boolean;
  modifications_count?: number;
  sheets?: string[];
  row_count?: number;
  column_count?: number;
}

export interface UploadResponse {
  file_id: string;
  owner_token?: string;
  filename: string;
  file_type: string;
  sheets: string[];
  sheet_shapes: Record<string, { name: string; row_count: number; column_count: number }>;
  active_sheet: string;
  profile_summary: SheetProfile;
  is_temp_modified?: boolean;
  modifications_count?: number;
  warnings: string[];
}

export interface PreviewResponse {
  file_id: string;
  sheet: string;
  page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
  columns: string[];
  rows: Record<string, any>[];
}

export interface Evidence {
  plan_plain_english: string;
  operation_steps: string[];
  matched_row_count: number;
  source_rows: Record<string, any>[];
  source_row_numbers: number[];
  skipped_missing: Record<string, number>;
  warnings: string[];
}

export interface QueryResultData {
  columns: string[];
  rows: Record<string, any>[];
  total_matches: number;
  truncated: boolean;
}

export interface ChartData {
  plotly: {
    data: any[];
    layout: any;
  };
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'none';
  x?: string;
  y?: string;
  title?: string;
  image_url?: string; // High-resolution data URI or URL of the generated chart image
  image_svg?: string;
}

export interface StructuredAnswerFormat {
  headline?: string;
  summary?: string;
  source_sheets?: string[];
  target_sheet?: string;
  key_metrics?: Array<{
    label: string;
    value: string;
    badge?: string;
    trend?: 'up' | 'down' | 'neutral';
  }>;
  sheet_breakdown?: Array<{
    sheet_name: string;
    count: number;
    metric_summary?: string;
  }>;
  bullet_points?: string[];
  data_table?: {
    headers: string[];
    rows: (string | number)[][];
  };
  takeaway?: string;
}

export interface QueryResponse {
  result_id: string;
  session_id: string;
  question?: string;
  status: 'ok' | 'clarify' | 'unsupported' | 'error';
  answer: string;
  interpretation: string;
  source_sheets?: string[];
  target_sheet?: string;
  result: QueryResultData;
  evidence: Evidence;
  chart?: ChartData | null;
  structured_format?: StructuredAnswerFormat | null;
  clarification?: {
    question: string;
    options: string[];
  } | null;
  plan?: any;
  warnings: string[];
  latency_ms: number;
  trace_id: string;
}

export interface InsightItem {
  id: string;
  category: 'data_quality' | 'missing_data' | 'duplicates' | 'mixed_types' | 'outliers' | 'trends' | 'correlation';
  severity: 'info' | 'warning';
  title: string;
  detail: string;
  affected_rows: number[];
  question_to_ask?: string;
}

export interface DashboardChartSpec {
  id: string;
  title: string;
  chart_type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';
  x: string;
  y?: string;
  isCurrency?: boolean;
  unit?: string;
  plotly: any;
  stats?: {
    total?: number;
    mean?: number;
    median?: number;
    stdDev?: number;
    min?: number;
    max?: number;
    topSegment?: string;
    topSegmentVal?: number;
    topSegmentPct?: number;
    count?: number;
  };
  metricsData?: {
    categories: string[];
    sums: number[];
    means: number[];
    counts: number[];
  };
  rawValues?: number[];
}

export interface InsightReport {
  sheet_name: string;
  row_count: number;
  column_count: number;
  header_row: number;
  summary_text: string;
  insights: InsightItem[];
  suggested_questions: string[];
  dashboard_charts: DashboardChartSpec[];
  available_sheets?: string[];
  is_workbook_overview?: boolean;
}

import { DashboardChartSpec } from '../api/types';

export type ChartColorThemeId = 'vibrant' | 'ocean' | 'sunset' | 'emerald' | 'twilight';

export interface ChartColorTheme {
  id: ChartColorThemeId;
  name: string;
  palette: string[];
  lineColor: string;
  lineFill: string;
  previewColors: [string, string, string];
}

export const CHART_THEMES: Record<ChartColorThemeId, ChartColorTheme> = {
  vibrant: {
    id: 'vibrant',
    name: 'Vibrant Jewel',
    palette: [
      '#2563EB', // Royal Blue
      '#059669', // Emerald
      '#7C3AED', // Vivid Violet
      '#D97706', // Warm Amber
      '#EC4899', // Hot Pink
      '#0891B2', // Cyan Teal
      '#EA580C', // Sunset Orange
      '#6366F1', // Indigo
      '#10B981', // Mint Green
      '#F43F5E', // Rose
      '#8B5CF6', // Purple
      '#06B6D4', // Sky Cyan
    ],
    lineColor: '#2563EB',
    lineFill: 'rgba(37, 99, 235, 0.16)',
    previewColors: ['#2563EB', '#059669', '#7C3AED'],
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean Blues',
    palette: [
      '#1D4ED8', // Deep Blue
      '#2563EB', // Royal Blue
      '#3B82F6', // Blue
      '#60A5FA', // Sky Blue
      '#0284C7', // Cerulean
      '#0EA5E9', // Cyan
      '#06B6D4', // Teal Cyan
      '#14B8A6', // Teal
    ],
    lineColor: '#0284C7',
    lineFill: 'rgba(2, 132, 199, 0.16)',
    previewColors: ['#1D4ED8', '#3B82F6', '#06B6D4'],
  },
  sunset: {
    id: 'sunset',
    name: 'Warm Sunset',
    palette: [
      '#EA580C', // Sunset Coral
      '#F97316', // Bright Orange
      '#FB923C', // Coral
      '#F59E0B', // Amber
      '#FBBF24', // Warm Gold
      '#D97706', // Deep Gold
      '#E11D48', // Crimson
      '#FB7185', // Rose
    ],
    lineColor: '#EA580C',
    lineFill: 'rgba(234, 88, 12, 0.16)',
    previewColors: ['#EA580C', '#F59E0B', '#E11D48'],
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Mint',
    palette: [
      '#047857', // Forest
      '#059669', // Deep Emerald
      '#10B981', // Emerald
      '#34D399', // Mint
      '#6EE7B7', // Soft Mint
      '#0D9488', // Deep Teal
      '#14B8A6', // Teal
      '#2DD4BF', // Turquoise
    ],
    lineColor: '#059669',
    lineFill: 'rgba(5, 150, 105, 0.16)',
    previewColors: ['#047857', '#10B981', '#14B8A6'],
  },
  twilight: {
    id: 'twilight',
    name: 'Neon Twilight',
    palette: [
      '#4338CA', // Indigo
      '#4F46E5', // Vivid Indigo
      '#6366F1', // Lavender Indigo
      '#7C3AED', // Violet
      '#8B5CF6', // Purple
      '#A855F7', // Magenta Purple
      '#C026D3', // Fuchsia
      '#EC4899', // Pink
    ],
    lineColor: '#7C3AED',
    lineFill: 'rgba(124, 58, 237, 0.16)',
    previewColors: ['#4F46E5', '#8B5CF6', '#C026D3'],
  },
};

/**
 * Dynamically applies the chosen color palette to any Plotly chart spec.
 * Works seamlessly with bars, lines, donuts, and histograms.
 */
export function applyThemeToChartData(
  chartSpec: DashboardChartSpec,
  themeId: ChartColorThemeId = 'vibrant'
): any[] {
  const theme = CHART_THEMES[themeId] || CHART_THEMES.vibrant;
  const originalData = chartSpec.plotly?.data || [];

  return originalData.map((trace: any) => {
    const copy = { ...trace };

    if (trace.type === 'bar') {
      const len = Array.isArray(trace.x) ? trace.x.length : theme.palette.length;
      copy.marker = {
        ...trace.marker,
        color: Array.from({ length: len }, (_, i) => theme.palette[i % theme.palette.length]),
        line: { color: '#ffffff', width: 1.5 },
        cornerradius: 8,
      };
    } else if (trace.type === 'scatter') {
      copy.line = {
        ...trace.line,
        color: theme.lineColor,
        width: 3.5,
        shape: 'spline',
      };
      copy.fillcolor = theme.lineFill;
      copy.marker = {
        ...trace.marker,
        color: theme.lineColor,
        line: { color: '#ffffff', width: 2 },
      };
    } else if (trace.type === 'pie') {
      copy.marker = {
        ...trace.marker,
        colors: theme.palette,
        line: { color: '#ffffff', width: 2 },
      };
    } else if (trace.type === 'histogram') {
      copy.marker = {
        ...trace.marker,
        color: theme.palette[1] || theme.palette[0],
        line: { color: theme.palette[0], width: 1.5 },
        cornerradius: 6,
      };
    }

    return copy;
  });
}

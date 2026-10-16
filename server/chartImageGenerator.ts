/**
 * Professional SVG Chart Image Generator for ExcelMind AI.
 * Produces crisp, standalone SVG chart images that can be embedded directly
 * into <img> tags via Data URI or downloaded as images.
 */

export interface ChartImageOptions {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';
  title: string;
  labels: string[];
  values: number[];
  xTitle?: string;
  yTitle?: string;
}

export const PALETTE = [
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
  '#F59E0B', // Golden Amber
  '#3B82F6', // Blue
];

export function generateChartSvg(options: ChartImageOptions): string {
  const { type, title, labels = [], values = [], xTitle = '', yTitle = '' } = options;
  const width = 800;
  const height = 450;

  // Clean data: take top 10 items for clear visibility
  const count = Math.min(labels.length, values.length, 10);
  const chartLabels = labels.slice(0, count).map((l) => String(l || 'Unknown'));
  const chartValues = values.slice(0, count).map((v) => Number(v) || 0);

  if (type === 'pie') {
    return generateDonutChartSvg(width, height, title, chartLabels, chartValues);
  } else if (type === 'line') {
    return generateLineChartSvg(width, height, title, chartLabels, chartValues, xTitle, yTitle);
  } else {
    // Default to Bar chart
    return generateBarChartSvg(width, height, title, chartLabels, chartValues, xTitle, yTitle);
  }
}

export function generateChartDataUrl(options: ChartImageOptions): string {
  const svg = generateChartSvg(options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNumber(num: number): string {
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(num) >= 100_000) {
    return `${(num / 1_000).toFixed(1)}k`;
  }
  return Number.isInteger(num) ? num.toLocaleString() : num.toFixed(2);
}

function generateBarChartSvg(
  width: number,
  height: number,
  title: string,
  labels: string[],
  values: number[],
  xTitle: string,
  yTitle: string
): string {
  const padLeft = 70;
  const padRight = 40;
  const padTop = 70;
  const padBottom = 80;

  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(0, ...values);
  const valRange = maxVal - minVal || 1;

  // Horizontal Grid lines & Y ticks
  const gridCount = 5;
  let gridSvg = '';
  for (let i = 0; i <= gridCount; i++) {
    const frac = i / gridCount;
    const yPos = padTop + chartHeight - frac * chartHeight;
    const tickVal = minVal + frac * valRange;
    gridSvg += `
      <line x1="${padLeft}" y1="${yPos}" x2="${width - padRight}" y2="${yPos}" stroke="#334155" stroke-width="1" stroke-dasharray="3 3" opacity="0.4" />
      <text x="${padLeft - 10}" y="${yPos + 4}" fill="#94a3b8" font-size="11" font-family="-apple-system, BlinkMacSystemFont, sans-serif" text-anchor="end">${escapeXml(formatNumber(tickVal))}</text>
    `;
  }

  // Draw Bars
  const barGap = 16;
  const totalGaps = (labels.length - 1) * barGap;
  const barWidth = Math.min(54, Math.max(18, (chartWidth - totalGaps) / (labels.length || 1)));
  const totalBarsWidth = labels.length * barWidth + totalGaps;
  const startX = padLeft + (chartWidth - totalBarsWidth) / 2;

  let barsSvg = '';
  labels.forEach((label, idx) => {
    const val = values[idx];
    const x = startX + idx * (barWidth + barGap);
    const barHeight = Math.max(4, (val / valRange) * chartHeight);
    const y = padTop + chartHeight - barHeight;
    const color = PALETTE[idx % PALETTE.length];

    // Truncate long label
    const shortLabel = label.length > 12 ? label.substring(0, 11) + '…' : label;

    barsSvg += `
      <g class="bar-group">
        <!-- Bar rect -->
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" ry="5" fill="${color}" opacity="0.9" filter="url(#drop-shadow)" />
        <!-- Value Label above bar -->
        <text x="${x + barWidth / 2}" y="${y - 8}" fill="#f8fafc" font-size="11" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, sans-serif" text-anchor="middle">
          ${escapeXml(formatNumber(val))}
        </text>
        <!-- X-axis Label -->
        <text x="${x + barWidth / 2}" y="${padTop + chartHeight + 20}" fill="#cbd5e1" font-size="11" font-family="-apple-system, BlinkMacSystemFont, sans-serif" text-anchor="middle">
          ${escapeXml(shortLabel)}
        </text>
      </g>
    `;
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
        <filter id="drop-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000000" flood-opacity="0.3" />
        </filter>
      </defs>

      <!-- Background Card -->
      <rect width="${width}" height="${height}" rx="16" fill="url(#bgGrad)" stroke="#334155" stroke-width="1.5" />

      <!-- Chart Header -->
      <text x="36" y="40" fill="#f8fafc" font-size="17" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, sans-serif">
        ${escapeXml(title)}
      </text>
      <text x="36" y="58" fill="#94a3b8" font-size="11" font-family="-apple-system, BlinkMacSystemFont, sans-serif">
        Generated by ExcelMind AI • Visual Data Breakdown
      </text>

      <!-- Grid & Axis -->
      ${gridSvg}
      <line x1="${padLeft}" y1="${padTop + chartHeight}" x2="${width - padRight}" y2="${padTop + chartHeight}" stroke="#475569" stroke-width="1.5" />

      <!-- Bars -->
      ${barsSvg}

      <!-- Axis Titles -->
      ${yTitle ? `<text x="24" y="${padTop - 12}" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="start">${escapeXml(yTitle)}</text>` : ''}
      ${xTitle ? `<text x="${width / 2}" y="${height - 18}" fill="#94a3b8" font-size="11" font-weight="600" text-anchor="middle">${escapeXml(xTitle)}</text>` : ''}
    </svg>
  `.trim();
}

function generateLineChartSvg(
  width: number,
  height: number,
  title: string,
  labels: string[],
  values: number[],
  xTitle: string,
  yTitle: string
): string {
  const padLeft = 70;
  const padRight = 40;
  const padTop = 70;
  const padBottom = 80;

  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(0, ...values);
  const valRange = maxVal - minVal || 1;

  // Grid lines
  const gridCount = 5;
  let gridSvg = '';
  for (let i = 0; i <= gridCount; i++) {
    const frac = i / gridCount;
    const yPos = padTop + chartHeight - frac * chartHeight;
    const tickVal = minVal + frac * valRange;
    gridSvg += `
      <line x1="${padLeft}" y1="${yPos}" x2="${width - padRight}" y2="${yPos}" stroke="#334155" stroke-width="1" stroke-dasharray="3 3" opacity="0.4" />
      <text x="${padLeft - 10}" y="${yPos + 4}" fill="#94a3b8" font-size="11" font-family="-apple-system, BlinkMacSystemFont, sans-serif" text-anchor="end">${escapeXml(formatNumber(tickVal))}</text>
    `;
  }

  // Calculate coordinates
  const stepX = chartWidth / (Math.max(1, labels.length - 1));
  const points = values.map((val, idx) => {
    const x = padLeft + idx * stepX;
    const y = padTop + chartHeight - ((val - minVal) / valRange) * chartHeight;
    return { x, y, val, label: labels[idx] };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + chartHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + chartHeight).toFixed(1)} Z`;

  let dotsSvg = '';
  points.forEach((p) => {
    const shortLabel = p.label.length > 10 ? p.label.substring(0, 9) + '…' : p.label;
    dotsSvg += `
      <g>
        <circle cx="${p.x}" cy="${p.y}" r="5" fill="#3b82f6" stroke="#ffffff" stroke-width="2" />
        <text x="${p.x}" y="${p.y - 10}" fill="#f8fafc" font-size="11" font-weight="600" text-anchor="middle">${escapeXml(formatNumber(p.val))}</text>
        <text x="${p.x}" y="${padTop + chartHeight + 20}" fill="#cbd5e1" font-size="11" text-anchor="middle">${escapeXml(shortLabel)}</text>
      </g>
    `;
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
        <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.4" />
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <rect width="${width}" height="${height}" rx="16" fill="url(#bgGrad)" stroke="#334155" stroke-width="1.5" />

      <text x="36" y="40" fill="#f8fafc" font-size="17" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${escapeXml(title)}</text>
      <text x="36" y="58" fill="#94a3b8" font-size="11" font-family="-apple-system, BlinkMacSystemFont, sans-serif">Generated by ExcelMind AI • Trend Analysis</text>

      ${gridSvg}
      <line x1="${padLeft}" y1="${padTop + chartHeight}" x2="${width - padRight}" y2="${padTop + chartHeight}" stroke="#475569" stroke-width="1.5" />

      <!-- Area fill -->
      <path d="${areaD}" fill="url(#areaGrad)" />
      <!-- Line stroke -->
      <path d="${pathD}" fill="none" stroke="#3b82f6" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Points & labels -->
      ${dotsSvg}

      ${yTitle ? `<text x="24" y="${padTop - 12}" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="start">${escapeXml(yTitle)}</text>` : ''}
      ${xTitle ? `<text x="${width / 2}" y="${height - 18}" fill="#94a3b8" font-size="11" font-weight="600" text-anchor="middle">${escapeXml(xTitle)}</text>` : ''}
    </svg>
  `.trim();
}

function generateDonutChartSvg(
  width: number,
  height: number,
  title: string,
  labels: string[],
  values: number[]
): string {
  const cx = 250;
  const cy = 250;
  const R = 130;
  const r = 65;

  const total = values.reduce((acc, curr) => acc + curr, 0) || 1;

  let currentAngle = -Math.PI / 2;
  let slicesSvg = '';
  let legendSvg = '';

  const legendX = 470;
  const legendStartY = 110;
  const legendLineHeight = 30;

  labels.forEach((label, idx) => {
    const val = values[idx];
    const fraction = val / total;
    const sliceAngle = fraction * 2 * Math.PI;
    const endAngle = currentAngle + sliceAngle;
    const color = PALETTE[idx % PALETTE.length];

    // Handle 100% slice or single slice without degenerate arc
    if (fraction >= 0.999 || labels.length === 1) {
      slicesSvg += `
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="${color}" stroke="#0f172a" stroke-width="2" opacity="0.95" />
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#0f172a" />
      `;
    } else {
      // Compute Donut Arc
      const x1 = cx + R * Math.cos(currentAngle);
      const y1 = cy + R * Math.sin(currentAngle);
      const x2 = cx + R * Math.cos(endAngle);
      const y2 = cy + R * Math.sin(endAngle);

      const x3 = cx + r * Math.cos(endAngle);
      const y3 = cy + r * Math.sin(endAngle);
      const x4 = cx + r * Math.cos(currentAngle);
      const y4 = cy + r * Math.sin(currentAngle);

      const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

      const pathD = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${largeArcFlag} 0 ${x4} ${y4} Z`;

      slicesSvg += `
        <path d="${pathD}" fill="${color}" stroke="#0f172a" stroke-width="2" opacity="0.95" />
      `;
    }

    // Legend item
    const pct = (fraction * 100).toFixed(1);
    const itemY = legendStartY + idx * legendLineHeight;
    const shortLabel = label.length > 16 ? label.substring(0, 15) + '…' : label;

    legendSvg += `
      <g>
        <rect x="${legendX}" y="${itemY - 11}" width="14" height="14" rx="3" fill="${color}" />
        <text x="${legendX + 22}" y="${itemY}" fill="#e2e8f0" font-size="12" font-weight="500" font-family="-apple-system, BlinkMacSystemFont, sans-serif">
          ${escapeXml(shortLabel)}
        </text>
        <text x="${width - 40}" y="${itemY}" fill="#94a3b8" font-size="12" font-weight="600" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, sans-serif">
          ${escapeXml(formatNumber(val))} (${pct}%)
        </text>
      </g>
    `;

    currentAngle = endAngle;
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
      </defs>

      <rect width="${width}" height="${height}" rx="16" fill="url(#bgGrad)" stroke="#334155" stroke-width="1.5" />

      <text x="36" y="40" fill="#f8fafc" font-size="17" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${escapeXml(title)}</text>
      <text x="36" y="58" fill="#94a3b8" font-size="11" font-family="-apple-system, BlinkMacSystemFont, sans-serif">Generated by ExcelMind AI • Category Share Distribution</text>

      <!-- Donut Slices -->
      <g>${slicesSvg}</g>

      <!-- Donut Center hole info -->
      <text x="${cx}" y="${cy - 6}" fill="#f8fafc" font-size="20" font-weight="800" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif">
        ${escapeXml(formatNumber(total))}
      </text>
      <text x="${cx}" y="${cy + 14}" fill="#94a3b8" font-size="11" font-weight="500" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif">
        Total
      </text>

      <!-- Legend Panel -->
      <g>${legendSvg}</g>
    </svg>
  `.trim();
}

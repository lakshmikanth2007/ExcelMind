/**
 * Formatting helpers for numbers, currencies, dates, and percentages.
 * Includes Indian digit grouping for Rupee (₹) currency per Section 16.
 */

export function formatValue(value: any, dtype?: string, columnName?: string): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const colLower = (columnName || '').toLowerCase();

  // If column or value implies Indian Rupees (₹ or LPA or INR)
  const isRupee = colLower.includes('₹') || colLower.includes('lpa') || colLower.includes('inr') || (typeof value === 'string' && value.includes('₹'));

  if (typeof value === 'number') {
    if (dtype === 'percent' || colLower.includes('%') || colLower.includes('percent') || colLower.includes('rate')) {
      return `${value.toFixed(1)}%`;
    }

    if (dtype === 'currency' || colLower.includes('salary') || colLower.includes('price') || colLower.includes('sales') || colLower.includes('profit') || colLower.includes('revenue')) {
      if (isRupee) {
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 2,
        }).format(value);
      }
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      }).format(value);
    }

    // Standard number
    if (Number.isInteger(value)) {
      return new Intl.NumberFormat(isRupee ? 'en-IN' : 'en-US').format(value);
    }
    return new Intl.NumberFormat(isRupee ? 'en-IN' : 'en-US', {
      maximumFractionDigits: 2,
    }).format(value);
  }

  // Date formatting
  if (dtype === 'date' || dtype === 'datetime' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) {
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      }
    } catch {
      // Fallback to raw string
    }
  }

  return String(value);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

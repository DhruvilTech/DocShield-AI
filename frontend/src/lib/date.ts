// src/lib/date.ts

/**
 * Safely parse any date input (MySQL string, ISO string, UTC timestamp, number, Date).
 * Resolves local timezone accurately without double-offset skewing.
 */
export function parseDate(dateInput: string | number | Date | null | undefined): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;

  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return null;

    // 1. MySQL standard datetime "YYYY-MM-DD HH:mm:ss"
    const mysqlPattern = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
    const match = trimmed.match(mysqlPattern);
    if (match) {
      const [, y, m, d, h, min, s] = match;
      const parsed = new Date(
        parseInt(y, 10),
        parseInt(m, 10) - 1,
        parseInt(d, 10),
        parseInt(h, 10),
        parseInt(min, 10),
        parseInt(s, 10)
      );
      if (!isNaN(parsed.getTime())) return parsed;
    }

    // 2. Standard ISO / fallback parsing
    const fallback = new Date(trimmed);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  return null;
}

/**
 * Formats full readable local date and time: e.g. "Sep 1, 2026, 01:05:48 PM"
 */
export function formatDateTime(dateInput: string | number | Date | null | undefined): string {
  const d = parseDate(dateInput);
  if (!d) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Formats local time only: e.g. "01:05 PM"
 */
export function formatTime(dateInput: string | number | Date | null | undefined): string {
  const d = parseDate(dateInput);
  if (!d) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats local date only: e.g. "Sep 1, 2026"
 */
export function formatDate(dateInput: string | number | Date | null | undefined): string {
  const d = parseDate(dateInput);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats relative time: e.g. "Just now", "4m ago", "2h ago", or date if older
 */
export function formatRelativeTime(dateInput: string | number | Date | null | undefined): string {
  const d = parseDate(dateInput);
  if (!d) return '—';
  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return formatDate(d);
}

// src/services/extractors/normalizer.js

/**
 * Clean and normalize extracted document text without losing the original raw text
 */
export class TextNormalizer {
  static normalizeWhitespace(text) {
    if (!text) return '';
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\t\f]/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  static cleanOcrArtifacts(text) {
    if (!text) return '';
    return text
      // Replace non-printable ASCII and control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Fix common OCR quotes and dashes
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .trim();
  }

  /**
   * Attempt to parse and standardize date formats to YYYY-MM-DD
   */
  static standardizeDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return dateStr;
    const clean = dateStr.trim().toUpperCase();

    // 1. ISO format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

    // 2. DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
    const dmyMatch = clean.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    // 3. DD MMM YYYY (e.g. 14 MAY 1995 or 14-MAY-1995)
    const monthMap = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    };
    const namedMatch = clean.match(/^(\d{1,2})[\s\-]([A-Z]{3})[\s\-](\d{4})$/);
    if (namedMatch) {
      const day = namedMatch[1].padStart(2, '0');
      const month = monthMap[namedMatch[2]];
      const year = namedMatch[3];
      if (month) return `${year}-${month}-${day}`;
    }

    // 4. MRZ YYMMDD format
    const mrzMatch = clean.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (mrzMatch) {
      const yy = parseInt(mrzMatch[1], 10);
      const currYy = new Date().getFullYear() % 100;
      const yearPrefix = yy > (currYy + 30) ? '19' : '20';
      return `${yearPrefix}${mrzMatch[1]}-${mrzMatch[2]}-${mrzMatch[3]}`;
    }

    return dateStr;
  }

  /**
   * Full normalization pipeline
   */
  static normalize(rawText) {
    if (!rawText) return '';
    let normalized = this.cleanOcrArtifacts(rawText);
    normalized = this.normalizeWhitespace(normalized);
    return normalized;
  }
}

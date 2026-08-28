// src/services/extractors/pdfExtractor.js
import zlib from 'zlib';

export class PdfExtractor {
  /**
   * Extract text, pages, and metadata from PDF buffer
   */
  static async extract(pdfBuffer) {
    const rawContent = pdfBuffer.toString('binary');
    const textPieces = [];
    let pageCount = 1;

    // 1. Estimate page count from PDF catalog
    const countMatch = rawContent.match(/\/Count\s+(\d+)/);
    if (countMatch) {
      pageCount = parseInt(countMatch[1], 10) || 1;
    } else {
      const pageMatches = rawContent.match(/\/Type\s*\/Page\b/g);
      if (pageMatches) {
        pageCount = pageMatches.length;
      }
    }

    // 2. Extract uncompressed literal text strings: (Text) Tj, [(T)(e)(x)(t)] TJ, 'string', "string"
    const tjRegex = /\(([^)]+)\)\s*Tj/g;
    let match;
    while ((match = tjRegex.exec(rawContent)) !== null) {
      const decoded = this.decodePdfString(match[1]);
      if (decoded) textPieces.push(decoded);
    }

    // Hex string matches: <48656c6c6f> Tj
    const hexTjRegex = /<([0-9A-Fa-f]+)>\s*Tj/g;
    while ((match = hexTjRegex.exec(rawContent)) !== null) {
      try {
        const decoded = Buffer.from(match[1], 'hex').toString('utf-8');
        if (decoded && decoded.trim()) textPieces.push(decoded);
      } catch (e) {}
    }

    // Array TJ text: [(...) -10 (...)] TJ
    const arrayTjRegex = /\[([^\]]+)\]\s*TJ/gi;
    while ((match = arrayTjRegex.exec(rawContent)) !== null) {
      const inner = match[1];
      const innerStrings = inner.match(/\(([^)]*)\)/g);
      if (innerStrings) {
        const line = innerStrings
          .map((s) => this.decodePdfString(s.slice(1, -1)))
          .join('');
        if (line.trim()) textPieces.push(line);
      }
    }

    // 3. Extract compressed FlateDecode streams if simple extraction returned little text
    if (textPieces.length < 5) {
      const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let streamMatch;
      while ((streamMatch = streamRegex.exec(rawContent)) !== null) {
        const streamBuffer = Buffer.from(streamMatch[1], 'binary');
        try {
          const uncompressed = zlib.inflateSync(streamBuffer);
          const uncompressedStr = uncompressed.toString('utf-8');

          let streamTjMatch;
          while ((streamTjMatch = tjRegex.exec(uncompressedStr)) !== null) {
            const decoded = this.decodePdfString(streamTjMatch[1]);
            if (decoded) textPieces.push(decoded);
          }

          let streamArrayMatch;
          while ((streamArrayMatch = arrayTjRegex.exec(uncompressedStr)) !== null) {
            const inner = streamArrayMatch[1];
            const innerStrings = inner.match(/\(([^)]*)\)/g);
            if (innerStrings) {
              const line = innerStrings
                .map((s) => this.decodePdfString(s.slice(1, -1)))
                .join('');
              if (line.trim()) textPieces.push(line);
            }
          }
        } catch (err) {
          // Stream might not be Flate encoded or may be encrypted/image stream
        }
      }
    }

    // 4. Fallback: extract plain ASCII text sequences if structured operators were not found
    if (textPieces.length === 0) {
      const plainAscii = rawContent
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/g, ' ')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 3 && !l.startsWith('%') && !l.includes('endobj') && !l.includes('xref'));

      textPieces.push(...plainAscii.slice(0, 50));
    }

    const rawText = textPieces.join('\n');

    return {
      rawText: rawText || 'PDF Document Binary Enclave (No direct textual layer found)',
      pageCount: Math.max(1, pageCount),
      extractor: 'PdfExtractor',
      metadata: {
        isEncrypted: rawContent.includes('/Encrypt'),
        pdfVersion: (rawContent.match(/%PDF-(\d+\.\d+)/) || [])[1] || '1.4',
        extractedPiecesCount: textPieces.length,
      },
    };
  }

  static decodePdfString(str) {
    if (!str) return '';
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .trim();
  }
}

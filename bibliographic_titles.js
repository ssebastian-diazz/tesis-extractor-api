const { resolvePdfUrlFromDocNumber } = require("./resolver_pdf");
const { extractBibliographyFromPdf } = require("./extractor");

function cleanText(text = "") {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s-\s/g, "-")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function isGarbageTitle(text) {
  const t = cleanText(text);
  const lower = t.toLowerCase();

  const garbagePatterns = [
    /https?:\/\//i,
    /\bwww\./i,
    /\bhtml?\b/i,
    /\basp\b/i,
    /\bpdf\b/i,
    /presenta información/i,
    /noticias actuales/i,
    /herramientas/i,
    /homepage/i,
    /sitio web/i,
    /recuperado de/i,
    /available from/i,
    /consultado en/i,
    /accessed/i,
    /^bibliograf/i,
    /^referencias/i
  ];

  if (garbagePatterns.some(rx => rx.test(t))) return true;

  const letters = (t.match(/[a-záéíóúñü]/gi) || []).length;
  const weird = (t.match(/[_~|{}[\]\\<>]/g) || []).length;

  if (letters < 15) return true;
  if (weird >= 3) return true;

  const digits = (t.match(/\d/g) || []).length;
  if (digits > 8 && digits / Math.max(t.length, 1) > 0.08) return true;

  return false;
}

function looksLikeTitle(text) {
  const t = cleanText(text);

  if (isGarbageTitle(t)) return false;
  if (t.length < 28 || t.length > 170) return false;

  const wc = wordCount(t);
  if (wc < 5 || wc > 22) return false;

  const longWords = t.match(/[a-záéíóúñü]{6,}/gi) || [];
  if (longWords.length < 2) return false;

  if (!/[a-záéíóúñü]/.test(t)) return false;

  return true;
}

function extractCandidateTitles(raw = "") {
  const text = cleanText(raw);
  const candidates = [];

  const afterYearRegex =
    /(?:\([12][0-9]{3}\)|\b[12][0-9]{3}\b)\.?\s+([^.;:]{25,180}?)(?=\.|;|, Revista|, Journal|, Vol|, Universidad|, Editorial|, México|, Madrid|, Londres|, New York| doi| https?:\/\/| Recuperado)/gi;

  for (const match of text.matchAll(afterYearRegex)) {
    candidates.push(match[1]);
  }

  const thesisRegex =
    /([A-ZÁÉÍÓÚÑ¿][^.;]{25,180}?)\s+\((?:tesis|trabajo|disertación)/gi;

  for (const match of text.matchAll(thesisRegex)) {
    candidates.push(match[1]);
  }

  const quoteRegex = /["“](.{25,180}?)["”]/g;

  for (const match of text.matchAll(quoteRegex)) {
    candidates.push(match[1]);
  }

  const parts = text.split(/\.\s+/);

  for (const part of parts) {
    const cleaned = cleanText(part)
      .replace(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñüÜ'-]+,\s?([A-Z]\.\s?)+/, "")
      .replace(/^[A-Z]\.\s+\([12][0-9]{3}\)\.?\s*/, "")
      .replace(/^\([12][0-9]{3}\)\.?\s*/, "")
      .trim();

    candidates.push(cleaned);
  }

  return candidates
    .map(cleanText)
    .filter(looksLikeTitle);
}

function normalizeKey(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeTitles(titles) {
  const seen = new Set();
  const out = [];

  for (const title of titles) {
    const key = normalizeKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }

  return out;
}

function scoreTitle(title, userContext = "") {
  const t = cleanText(title);
  const lower = t.toLowerCase();

  if (isGarbageTitle(t)) return -999;

  let score = 0;

  const academicTerms = [
    "análisis", "relación", "efecto", "impacto", "prevalencia",
    "evaluación", "estudio", "síndrome", "modelo", "estrategia",
    "intervención", "desarrollo", "teoría", "política", "derecho",
    "burnout", "stress", "study", "analysis", "impact", "effect",
    "relationship", "evaluation", "model", "intervention",
    "prevalence", "regulation", "virulence"
  ];

  for (const term of academicTerms) {
    if (lower.includes(term)) score += 3;
  }

  const wc = wordCount(t);
  if (wc >= 6 && wc <= 14) score += 4;
  if (wc >= 15 && wc <= 20) score += 2;

  const ctxWords = new Set(
    userContext
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 5)
  );

  for (const w of lower.split(/\W+/)) {
    if (ctxWords.has(w)) score += 3;
  }

  if (/\.com|\.org|\.mx|http|www/i.test(t)) score -= 50;
  if (/presenta información|herramientas|noticias/i.test(t)) score -= 50;
  if (/\b\d{1,3}\s*$/.test(t)) score -= 4;

  return score;
}

function extractTitlesFromExtraction({
  extraction,
  userContext = "",
  maxTitles = 5
}) {
  const rawTexts = [];

  if (Array.isArray(extraction?.bibliography)) {
    for (const ref of extraction.bibliography) {
      if (ref.raw) rawTexts.push(ref.raw);
    }
  }

  if (extraction?.bibliography_download_text) {
    rawTexts.push(extraction.bibliography_download_text);
  }

  if (extraction?.bibliography_text_preview) {
    rawTexts.push(extraction.bibliography_text_preview);
  }

  let titles = [];

  for (const raw of rawTexts) {
    titles.push(...extractCandidateTitles(raw));
  }

  return dedupeTitles(titles)
    .map(title => ({
      title,
      score: scoreTitle(title, userContext)
    }))
    .filter(item => item.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTitles);
}

async function getBibliographicTitlesForThesis({
  doc_number,
  source_thesis_title,
  userContext = "",
  maxTitles = 5
}) {
  const resolved = await resolvePdfUrlFromDocNumber(doc_number);

  if (!resolved.success || !resolved.pdf_url) {
    return {
      success: false,
      doc_number,
      source_thesis_title,
      status: "PDF_RESOLUTION_FAILED",
      resolved,
      detected_titles: []
    };
  }

  const extraction = await extractBibliographyFromPdf(resolved.pdf_url);

  if (!extraction.success && extraction.status !== "OK") {
    return {
      success: false,
      doc_number,
      source_thesis_title,
      status: extraction.status || "EXTRACTION_FAILED",
      resolved,
      extraction_status: extraction.status,
      detected_titles: []
    };
  }

  const detected_titles = extractTitlesFromExtraction({
    extraction,
    userContext,
    maxTitles
  });

  return {
    success: true,
    doc_number,
    source_thesis_title,
    status: "OK",
    resolved,
    extraction_summary: {
      status: extraction.status,
      parsing_mode: extraction.parsing_mode,
      total_references: extraction.total_references,
      quality_tier: extraction.bibliography_quality_tier
    },
    detected_titles
  };
}

module.exports = {
  getBibliographicTitlesForThesis,
  extractTitlesFromExtraction
};

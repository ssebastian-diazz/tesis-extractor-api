const express = require("express");
const fs = require("fs");
const path = require("path");

const { extractBibliographyFromPdf } = require("./extractor");

let getBibliographicTitlesForThesis = null;

try {
  ({ getBibliographicTitlesForThesis } = require("./bibliographic_titles"));
} catch (error) {
  console.warn("⚠️ No se pudo cargar ./bibliographic_titles.js");
  console.warn("⚠️ El endpoint pesado /bibliographic-titles quedará desactivado.");
}

const app = express();

app.use(express.json({ limit: "10mb" }));

const CACHE_DIR = path.join(__dirname, "bibliography_cache");
const SAMPLE_CACHE_FILE = path.join(
  CACHE_DIR,
  "resultados_muestra_30_bibliografias.json"
);

// ============================================
// ROOT
// ============================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "TESIUNAM extractor API running",
    mode: "cache-first",
    endpoints: [
      "POST /extract",
      "POST /bibliographic-titles-heavy",
      "GET /bibliography-cache/muestra-30",
      "POST /bibliography-cache/by-doc-numbers"
    ],
    warning:
      "No usar extracción bibliográfica pesada en frontend. Usar cache preprocesado."
  });
});

// ============================================
// EXTRACT BIBLIOGRAPHY FROM PDF URL
// Endpoint pesado. Solo debug/manual.
// ============================================

app.post("/extract", async (req, res) => {
  try {
    const { pdf_url } = req.body;

    if (!pdf_url) {
      return res.status(400).json({
        success: false,
        error: "Missing pdf_url"
      });
    }

    const result = await extractBibliographyFromPdf(pdf_url);

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("❌ Extract error:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// HEAVY BIBLIOGRAPHIC TITLES
// NO USAR EN FRONTEND.
// Resuelve PDF + descarga + parsea.
// Solo debug o batch manual.
// ============================================

app.post("/bibliographic-titles-heavy", async (req, res) => {
  try {
    if (!getBibliographicTitlesForThesis) {
      return res.status(500).json({
        success: false,
        error:
          "Module ./bibliographic_titles.js not found or failed to load."
      });
    }

    const {
      doc_number,
      source_thesis_title,
      user_context,
      max_titles
    } = req.body;

    if (!doc_number) {
      return res.status(400).json({
        success: false,
        error: "Missing doc_number"
      });
    }

    const result = await getBibliographicTitlesForThesis({
      doc_number,
      source_thesis_title,
      userContext: user_context || "",
      maxTitles: max_titles || 5
    });

    return res.json(result);
  } catch (error) {
    console.error("❌ bibliographic-titles-heavy error:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// OLD ENDPOINT BLOCKED INTENTIONALLY
// Para evitar usarlo por accidente en vivo.
// ============================================

app.post("/bibliographic-titles", async (req, res) => {
  return res.status(410).json({
    success: false,
    error:
      "Endpoint deprecated for live use. Use precomputed cache instead.",
    use_instead: [
      "GET /bibliography-cache/muestra-30",
      "POST /bibliography-cache/by-doc-numbers"
    ]
  });
});

// ============================================
// READ FULL SAMPLE CACHE
// ============================================

app.get("/bibliography-cache/muestra-30", (req, res) => {
  try {
    if (!fs.existsSync(SAMPLE_CACHE_FILE)) {
      return res.status(404).json({
        success: false,
        error: "Sample bibliography cache not found.",
        expected_file: SAMPLE_CACHE_FILE
      });
    }

    const data = JSON.parse(
      fs.readFileSync(SAMPLE_CACHE_FILE, "utf8")
    );

    return res.json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error("❌ cache read error:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// READ CACHE BY DOC NUMBERS
// Runtime ligero para frontend/Groq.
// ============================================

app.post("/bibliography-cache/by-doc-numbers", (req, res) => {
  try {
    const { doc_numbers, min_titles = 2 } = req.body;

    if (!Array.isArray(doc_numbers)) {
      return res.status(400).json({
        success: false,
        error: "doc_numbers must be an array"
      });
    }

    if (!fs.existsSync(SAMPLE_CACHE_FILE)) {
      return res.status(404).json({
        success: false,
        error: "Bibliography cache not found.",
        expected_file: SAMPLE_CACHE_FILE
      });
    }

    const cache = JSON.parse(
      fs.readFileSync(SAMPLE_CACHE_FILE, "utf8")
    );

    const wanted = new Set(
      doc_numbers.map(x => String(x).trim())
    );

    const results = (cache.results || [])
      .filter(item => wanted.has(String(item.doc_number).trim()))
      .filter(item =>
        Array.isArray(item.detected_titles) &&
        item.detected_titles.length >= min_titles
      )
      .map(item => ({
        doc_number: item.doc_number,
        source_thesis_title: item.source_thesis_title,
        status: item.status,
        extraction_summary: item.extraction_summary,
        detected_titles: item.detected_titles,
        ready_for_ai: item.ready_for_ai
      }));

    return res.json({
      success: true,
      requested: doc_numbers.length,
      returned: results.length,
      results
    });
  } catch (error) {
    console.error("❌ cache by doc numbers error:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Extractor API listening on port ${PORT}`);
});

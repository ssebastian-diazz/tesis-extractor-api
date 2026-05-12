const express = require("express");

const { extractBibliographyFromPdf } = require("./extractor");

const {
  getBibliographicTitlesForThesis
} = require("./bibliographic_titles");

const app = express();

app.use(express.json({ limit: "10mb" }));

// ============================================
// ROOT
// ============================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "TESIUNAM extractor API running",
    endpoints: [
      "POST /extract",
      "POST /bibliographic-titles"
    ]
  });
});

// ============================================
// EXTRACT BIBLIOGRAPHY
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

    const result =
      await extractBibliographyFromPdf(pdf_url);

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
// BIBLIOGRAPHIC TITLES
// ============================================

app.post("/bibliographic-titles", async (req, res) => {
  try {

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

    const result =
      await getBibliographicTitlesForThesis({
        doc_number,
        source_thesis_title,
        userContext: user_context || "",
        maxTitles: max_titles || 5
      });

    return res.json(result);

  } catch (error) {

    console.error(
      "❌ bibliographic-titles error:",
      error
    );

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
  console.log(
    `Extractor API listening on port ${PORT}`
  );
});

const express = require("express");
const { extractBibliographyFromPdf } = require("./extractor");

const app = express();

app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "TESIUNAM extractor API running",
    endpoints: ["POST /extract"]
  });
});

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Extractor API listening on port ${PORT}`);
});

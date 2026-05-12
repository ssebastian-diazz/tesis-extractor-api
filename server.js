const { extractBibliographyFromPdf } = require("./extractor");

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

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

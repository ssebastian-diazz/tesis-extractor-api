const express = require("express");

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "TESIUNAM extractor API running",
    endpoints: ["POST /extract"]
  });
});

app.post("/extract", async (req, res) => {
  res.json({
    success: true,
    message: "Endpoint /extract activo",
    received: req.body
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Extractor API listening on port ${PORT}`);
});

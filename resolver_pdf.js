const axios = require("axios");

const KOHA_BASE = "https://tesiunam.dgb.unam.mx";
const DOCS_BASE = "https://tesiunamdocumentos.dgb.unam.mx";

function normalizeDocNumber(docNumber) {
  return String(docNumber || "").trim();
}

function extractFirstIndexUrl(html) {
  const match = html.match(/https:\/\/tesiunamdocumentos\.dgb\.unam\.mx\/[^"]+?\/Index\.html/i);
  return match ? match[0] : null;
}

function extractBiblionumber(html) {
  const match = html.match(/data-biblionumber=["']?(\d+)["']?/i);
  return match ? match[1] : null;
}

function extractPdfViewerFile(indexHtml) {
  const match = indexHtml.match(/\/pdfviewer\?file=([^"'>\s]+)/i);
  return match ? match[1] : null;
}

async function resolvePdfUrlFromDocNumber(docNumber) {
  const cleanDocNumber = normalizeDocNumber(docNumber);

  if (!cleanDocNumber) {
    throw new Error("Missing doc_number");
  }

  const searchUrl =
    `${KOHA_BASE}/cgi-bin/koha/opac-search.pl?idx=&q=${encodeURIComponent(cleanDocNumber)}&weight_search=1`;

  console.log(`🔎 Buscando doc_number: ${cleanDocNumber}`);

  const searchResponse = await axios.get(searchUrl, {
    timeout: 120000,
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const searchHtml = searchResponse.data;

  const biblionumber = extractBiblionumber(searchHtml);
  const indexUrl = extractFirstIndexUrl(searchHtml);

  if (!indexUrl) {
    return {
      success: false,
      status: "NO_INDEX_URL",
      doc_number: cleanDocNumber,
      biblionumber,
      search_url: searchUrl
    };
  }

  console.log(`✅ Index encontrado: ${indexUrl}`);

  const indexResponse = await axios.get(indexUrl, {
    timeout: 120000,
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const indexHtml = indexResponse.data;

  const pdfFilePath = extractPdfViewerFile(indexHtml);

  if (!pdfFilePath) {
    return {
      success: false,
      status: "NO_PDFVIEWER_FILE",
      doc_number: cleanDocNumber,
      biblionumber,
      search_url: searchUrl,
      index_url: indexUrl
    };
  }

  const pdfUrl = `${DOCS_BASE}${pdfFilePath}`;

  return {
    success: true,
    status: "OK",
    doc_number: cleanDocNumber,
    biblionumber,
    search_url: searchUrl,
    index_url: indexUrl,
    pdf_url: pdfUrl
  };
}

module.exports = {
  resolvePdfUrlFromDocNumber
};

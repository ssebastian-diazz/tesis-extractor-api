const axios = require("axios");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

const BIBLIOGRAPHY_PATTERNS = [
  /bibliograf/i,
  /referencias bibliográficas/i,
  /referencias/i,
  /fuentes consultadas/i,
  /works cited/i
];

function isBibliography(title = "") {
  return BIBLIOGRAPHY_PATTERNS.some(regex => regex.test(title));
}

async function extractPageText(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();

  return textContent.items
    .map(item => item.str)
    .join(" ");
}

function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s-\s/g, "-")
    .replace(/https?:\s+/g, "https:")
    .replace(/chrome-extension:\/\/\S+/g, "")
    .replace(/\s\d{1,3}\s(?=[A-ZÁÉÍÓÚ])/g, " ")
    .trim();
}

function detectReferenceMode(text) {
  const numberedMatches = text.match(/\b\d+\.\s/g) || [];
  const bulletMatches = text.match(/[•▪◦●■□◆➜►\-]\s/g) || [];

  console.log("\n📊 DETECCIÓN FORMATO");
  console.log(`🔢 Posibles referencias numeradas: ${numberedMatches.length}`);
  console.log(`• Posibles bullets: ${bulletMatches.length}`);

  if (numberedMatches.length >= 5) return "numbered";
  if (bulletMatches.length >= 5) return "bullets";
  return "heuristic";
}

function parseNumberedReferences(text) {
  console.log("\n🧠 PARSING NUMERADO...\n");

  const references = [];
  const regex = /\b(\d+)\.\s/g;
  const matches = [...text.matchAll(regex)];

  if (!matches.length) return references;

  let expected = 1;
  let currentStart = null;

  for (let i = 0; i < matches.length; i++) {
    const number = parseInt(matches[i][1], 10);

    if (number !== expected) continue;

    if (currentStart !== null) {
      const reference = text.slice(currentStart, matches[i].index).trim();

      if (reference.length > 30) {
        references.push(reference);
      }
    }

    currentStart = matches[i].index;
    expected++;
  }

  if (currentStart !== null) {
    const finalReference = text.slice(currentStart).trim();

    if (finalReference.length > 30) {
      references.push(finalReference);
    }
  }

  return references;
}

function parseBulletReferences(text) {
  console.log("\n🧠 PARSING BULLETS...\n");

  return text
    .split(/[•▪◦●■□◆➜►]\s/)
    .map(r => r.trim())
    .filter(r => r.length > 40);
}

function parseHeuristicReferences(text) {
  console.log("\n🧠 PARSING HEURÍSTICO...\n");

  const chunks = text.split(
    /(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ\-]+(?:\s[A-Z]\.)+)/
  );

  const references = [];

  for (const chunk of chunks) {
    let score = 0;

    if (/\b(19|20)\d{2}\b/.test(chunk)) score += 1;
    if (/https?:\/\//.test(chunk)) score += 2;
    if (/Rev|Journal|Vol|DOI|Universidad|Dent|SciELO/i.test(chunk)) score += 1;
    if (chunk.length > 80) score += 1;

    if (score >= 2) {
      references.push(chunk.trim());
    }
  }

  return references;
}

async function resolveOutlineSections(pdf) {
  const outline = await pdf.getOutline();

  if (!outline || outline.length === 0) {
    return [];
  }

  const sections = [];

  async function walk(items) {
    for (const item of items) {
      try {
        let destination = null;

        if (typeof item.dest === "string") {
          destination = await pdf.getDestination(item.dest);
        } else if (Array.isArray(item.dest)) {
          destination = item.dest;
        }

        if (destination) {
          const pageRef = destination[0];
          const pageIndex = await pdf.getPageIndex(pageRef);

          sections.push({
            title: item.title,
            page: pageIndex + 1
          });
        }

        if (item.items && item.items.length > 0) {
          await walk(item.items);
        }
      } catch (err) {
        console.log(`⚠️ Error resolviendo sección "${item.title}": ${err.message}`);
      }
    }
  }

  await walk(outline);

  return sections.sort((a, b) => a.page - b.page);
}

async function extractBibliographyFromPdf(pdfUrl) {
  if (!pdfUrl || !/^https?:\/\//i.test(pdfUrl)) {
    throw new Error("Invalid or missing pdf_url");
  }

  console.log("\n⬇️ Descargando PDF...\n");
  console.log(pdfUrl);

  const response = await axios.get(pdfUrl, {
    responseType: "arraybuffer",
    timeout: 45000
  });

  const pdfData = new Uint8Array(response.data);

  console.log("📖 Cargando PDF...\n");

  const loadingTask = pdfjsLib.getDocument({
    data: pdfData
  });

  const pdf = await loadingTask.promise;

  console.log("✅ PDF cargado");
  console.log("📄 Total páginas:", pdf.numPages);

  console.log("\n🧠 Extrayendo outline...\n");

  const sections = await resolveOutlineSections(pdf);

  if (!sections.length) {
    return {
      thesis_url: pdfUrl,
      extracted_at: new Date().toISOString(),
      status: "NO_OUTLINE",
      bibliography: []
    };
  }

  console.log("\n📚 SECCIONES DETECTADAS:\n");

  sections.forEach(section => {
    console.log(`• ${section.title} → página ${section.page}`);
  });

  const bibliographyIndex = sections.findIndex(section =>
    isBibliography(section.title)
  );

  if (bibliographyIndex === -1) {
    return {
      thesis_url: pdfUrl,
      extracted_at: new Date().toISOString(),
      status: "NO_BIBLIOGRAPHY_SECTION",
      sections,
      bibliography: []
    };
  }

  const bibliographySection = sections[bibliographyIndex];
  const bibliographyStartPage = bibliographySection.page;

  let bibliographyEndPage = pdf.numPages;

  const nextSection = sections[bibliographyIndex + 1];

  if (nextSection) {
    bibliographyEndPage = nextSection.page - 1;
  }

  console.log("\n========================");
  console.log("📚 BIBLIOGRAFÍA");
  console.log("========================\n");
  console.log(`Título: ${bibliographySection.title}`);
  console.log(`Inicio: ${bibliographyStartPage}`);
  console.log(`Fin: ${bibliographyEndPage}`);

  let bibliographyText = "";

  for (
    let pageNum = bibliographyStartPage;
    pageNum <= bibliographyEndPage;
    pageNum++
  ) {
    console.log(`📄 Página ${pageNum}`);

    const pageText = await extractPageText(pdf, pageNum);
    bibliographyText += "\n\n" + pageText;
  }

  bibliographyText = cleanText(bibliographyText);

  if (bibliographyText.length < 100) {
    return {
      thesis_url: pdfUrl,
      extracted_at: new Date().toISOString(),
      status: "NO_TEXT_LAYER_OR_EMPTY_BIBLIOGRAPHY",
      bibliography_section: bibliographySection,
      bibliography_pages: {
        start: bibliographyStartPage,
        end: bibliographyEndPage
      },
      bibliography: []
    };
  }

  const mode = detectReferenceMode(bibliographyText);

  console.log(`\n🧠 MODO DETECTADO: ${mode}\n`);

  let references = [];

  if (mode === "numbered") {
    references = parseNumberedReferences(bibliographyText);
  } else if (mode === "bullets") {
    references = parseBulletReferences(bibliographyText);
  } else {
    references = parseHeuristicReferences(bibliographyText);
  }

  references = references
    .map(ref => ref.trim())
    .filter(ref => ref.length > 30);
  
  const output = {
    thesis_url: pdfUrl,
    extracted_at: new Date().toISOString(),
    status: "OK",
    bibliography_section: bibliographySection,
    bibliography_pages: {
      start: bibliographyStartPage,
      end: bibliographyEndPage
    },
    parsing_mode: mode,
    total_references: references.length,
    bibliography_text_preview:
    references.length === 0
    ? bibliographyText.slice(0, 2500)
    : undefined,
    bibliography: references.map((ref, index) => ({
      id: index + 1,
      raw: ref
    }))
  };

  return output;
}

module.exports = {
  extractBibliographyFromPdf
};

const FONT_NAME = 'DejaVuSans';
const FONT_NORMAL = 'DejaVuSans.ttf';
const FONT_BOLD = 'DejaVuSans-Bold.ttf';
const FONT_NORMAL_URL =
  'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf';
const FONT_BOLD_URL =
  'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf';

let fontsPromise = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFontFiles() {
  const [normalRes, boldRes] = await Promise.all([
    fetch(FONT_NORMAL_URL),
    fetch(FONT_BOLD_URL),
  ]);
  if (!normalRes.ok || !boldRes.ok) {
    throw new Error('Could not load PDF fonts');
  }
  return {
    normalB64: arrayBufferToBase64(await normalRes.arrayBuffer()),
    boldB64: arrayBufferToBase64(await boldRes.arrayBuffer()),
  };
}

/** Register DejaVu Sans so PDFs can render ₹ and other Unicode. */
export async function ensurePdfUnicodeFont(doc) {
  if (!fontsPromise) {
    fontsPromise = loadFontFiles();
  }
  const { normalB64, boldB64 } = await fontsPromise;
  if (!doc.__dejaVuRegistered) {
    doc.addFileToVFS(FONT_NORMAL, normalB64);
    doc.addFileToVFS(FONT_BOLD, boldB64);
    doc.addFont(FONT_NORMAL, FONT_NAME, 'normal');
    doc.addFont(FONT_BOLD, FONT_NAME, 'bold');
    doc.__dejaVuRegistered = true;
  }
  doc.setFont(FONT_NAME, 'normal');
  return FONT_NAME;
}

export const PDF_UNICODE_FONT = FONT_NAME;

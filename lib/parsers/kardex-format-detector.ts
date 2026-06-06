// Detector de formato de PDF de Kardex.
//
// DISEÑO CRÍTICO: la función principal `detectKardexFormatFromPages` recibe
// las páginas ya extraídas (TextItem[][]) para evitar llamar a extractPages()
// más de una vez por request. Llamar a getDocumentProxy varias veces con el
// mismo Uint8Array falla con DataCloneError porque pdfjs-dist transfiere el
// ArrayBuffer al Worker en la primera llamada, dejándolo detached.
//
// El wrapper `detectKardexFormat(bytes)` existe solo para tests y usos externos;
// en el API route siempre usar `detectKardexFormatFromPages`.
//
// Marcadores de detección:
//   SIGA/CUCEI  → "Ultimo Ciclo" (sin tilde), "CAMPUS TECNOLOGICO"
//   SIIAU       → "Último Ciclo" (con tilde), "Nota de Créd"

import { extractPages } from '@/lib/extractPdf';
import { buildKardex }    from '@/lib/parseKardex';
import { parseSigaPages } from '@/lib/parsers/kardex-siga.parser';
import type { TextItem }  from '@/lib/types';

export type KardexFormat = 'siga-cucei' | 'formato-anterior' | 'desconocido';

// ─── Análisis textual ──────────────────────────────────────────────────────────

function detectarPorTexto(blob: string): KardexFormat | null {
  // "Ultimo Ciclo" sin tilde es exclusivo del formato SIGA
  if (/Ultimo Ciclo/i.test(blob))       return 'siga-cucei';
  // "Último Ciclo" con tilde es el label del SIIAU (Oracle Reports)
  if (/Último Ciclo/i.test(blob))       return 'formato-anterior';
  // Campus CUCEI aparece en el encabezado SIGA
  if (/CAMPUS TECNOLOGICO/i.test(blob)) return 'siga-cucei';
  // "Nota de Créditos" solo aparece en el SIIAU
  if (/Nota de Créd/i.test(blob))       return 'formato-anterior';
  return null;
}

// ─── Función principal (acepta páginas ya extraídas) ──────────────────────────

export function detectKardexFormatFromPages(paginas: TextItem[][]): KardexFormat {
  const blob = (paginas[0] ?? []).map(i => i.text).join(' ');

  const porTexto = detectarPorTexto(blob);
  if (porTexto) return porTexto;

  // Fallback funcional: intentar ambos parsers con las páginas ya disponibles
  // (sin volver a llamar a extractPages)
  try {
    const r = parseSigaPages(paginas);
    if (r.estudiante.codigo && r.estudiante.nombre) return 'siga-cucei';
  } catch { /* continuar */ }

  try {
    const r = buildKardex(paginas);
    if (r.estudiante.codigo && r.estudiante.nombre) return 'formato-anterior';
  } catch { /* continuar */ }

  return 'desconocido';
}

// ─── Wrapper para tests y usos externos ───────────────────────────────────────

export async function detectKardexFormat(bytes: Uint8Array): Promise<KardexFormat> {
  const paginas = await extractPages(bytes);
  return detectKardexFormatFromPages(paginas);
}

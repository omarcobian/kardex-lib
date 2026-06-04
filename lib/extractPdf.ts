// Extracción de texto del PDF con sus coordenadas, usando `unpdf`
// (envoltura de pdf.js lista para entornos Node/serverless, sin configurar worker).

import { getDocumentProxy } from 'unpdf';
import type { TextItem } from './types';

/**
 * Devuelve, por cada página, la lista de fragmentos de texto con su posición.
 * `transform[4]` es la X y `transform[5]` la Y (origen abajo-izquierda) de cada fragmento.
 */
export async function extractPages(data: Uint8Array): Promise<TextItem[][]> {
  const pdf = await getDocumentProxy(data);
  const paginas: TextItem[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items: TextItem[] = [];

    for (const raw of content.items as Array<{ str?: unknown; transform?: number[] }>) {
      if (typeof raw.str !== 'string') continue; // omite marcadores (saltos de línea, etc.)
      const text = raw.str.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const t = raw.transform;
      if (!t || t.length < 6) continue;
      items.push({ x: t[4], y: t[5], text });
    }
    paginas.push(items);
  }
  return paginas;
}

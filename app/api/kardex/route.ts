import { NextRequest, NextResponse } from 'next/server';
import { extractPages } from '@/lib/extractPdf';
import { buildKardex } from '@/lib/parseKardex';

// pdf.js necesita el runtime de Node (Buffer/Uint8Array), no Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/kardex
 * Acepta el PDF de dos formas:
 *   1) multipart/form-data, en el campo `file` (o `archivo` / `pdf`).
 *   2) El binario del PDF directo en el body con Content-Type: application/pdf.
 *
 * Responde con el Kardex en JSON: { estudiante, materias, resumenCreditos, totalMaterias }.
 */
export async function POST(req: NextRequest) {
  try {
    const ctype = req.headers.get('content-type') ?? '';
    let bytes: Uint8Array | null = null;

    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file') ?? form.get('archivo') ?? form.get('pdf');
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Envía el PDF en el campo 'file' (multipart/form-data)." },
          { status: 400 },
        );
      }
      bytes = new Uint8Array(await file.arrayBuffer());
    } else if (
      ctype.includes('application/pdf') ||
      ctype.includes('application/octet-stream')
    ) {
      bytes = new Uint8Array(await req.arrayBuffer());
    } else {
      return NextResponse.json(
        {
          error:
            "Content-Type no soportado. Usa multipart/form-data (campo 'file') o application/pdf.",
        },
        { status: 415 },
      );
    }

    if (!bytes || bytes.byteLength === 0) {
      return NextResponse.json({ error: 'Archivo vacío.' }, { status: 400 });
    }

    const paginas = await extractPages(bytes);
    const kardex = buildKardex(paginas);

    // Si no se reconoció nada, probablemente no es un Kardex de la UdeG.
    if (!kardex.estudiante.codigo && kardex.materias.length === 0) {
      return NextResponse.json(
        { error: 'No se pudo interpretar el PDF como un Kardex de la UdeG (SIIAU).' },
        { status: 422 },
      );
    }

    return NextResponse.json(kardex, { status: 200 });
  } catch (err) {
    console.error('Error en /api/kardex:', err);
    return NextResponse.json(
      { error: 'Error al procesar el PDF.', detalle: (err as Error)?.message },
      { status: 500 },
    );
  }
}

/** GET /api/kardex — información de uso. */
export async function GET() {
  return NextResponse.json({
    nombre: 'API Kardex UdeG',
    metodo: 'POST',
    uso: "POST /api/kardex con el PDF en multipart/form-data (campo 'file') o con Content-Type: application/pdf en el body.",
    devuelve: ['estudiante', 'materias', 'resumenCreditos', 'totalMaterias'],
  });
}
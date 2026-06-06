import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'hoja_membretada.pdf');
    const bytes = await fs.readFile(filePath);
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="hoja_membretada.pdf"',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudo leer la hoja membretada.', detalle: (err as Error).message },
      { status: 500 },
    );
  }
}

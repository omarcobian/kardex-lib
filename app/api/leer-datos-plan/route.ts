import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const [planInbi, planLib, equivalencias] = await Promise.all([
      fs.readFile(path.join(dataDir, 'plan-antiguo.json'), 'utf-8').then(JSON.parse),
      fs.readFile(path.join(dataDir, 'plan-nuevo.json'), 'utf-8').then(JSON.parse),
      fs.readFile(path.join(dataDir, 'equivalencias.json'), 'utf-8').then(JSON.parse),
    ]);
    return NextResponse.json({ planInbi, planLib, equivalencias });
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudieron leer los datos del plan.', detalle: (err as Error).message },
      { status: 500 },
    );
  }
}

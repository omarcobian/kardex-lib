import { NextRequest, NextResponse } from 'next/server';
import { readData, writeData, deleteData } from '@/lib/storage';

const ALLOWED_KEYS: Record<string, string> = {
  conteo: 'conteo.json',
  demanda: 'demanda.json',
  demanda_inbi: 'demanda-inbi.json',
  faltantes_global: 'faltantes-global.json',
  folios: 'folios.json',
};

function resolveFile(key: string): string | null {
  return ALLOWED_KEYS[key] ?? null;
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) {
    const all: Record<string, unknown> = {};
    for (const [k, file] of Object.entries(ALLOWED_KEYS)) {
      all[k] = await readData(file, null);
    }
    return NextResponse.json(all);
  }

  const file = resolveFile(key);
  if (!file) return NextResponse.json({ error: 'invalid key' }, { status: 400 });

  const data = await readData(file, null);
  return NextResponse.json({ key, data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { key, data } = body as { key: string; data: unknown };

  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const file = resolveFile(key);
  if (!file) return NextResponse.json({ error: 'invalid key' }, { status: 400 });

  await writeData(file, data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');

  if (!key) {
    for (const file of Object.values(ALLOWED_KEYS)) {
      await deleteData(file);
    }
    return NextResponse.json({ ok: true, cleared: 'all' });
  }

  const file = resolveFile(key);
  if (!file) return NextResponse.json({ error: 'invalid key' }, { status: 400 });

  await deleteData(file);
  return NextResponse.json({ ok: true });
}

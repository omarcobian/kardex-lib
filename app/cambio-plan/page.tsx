'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type DragEvent,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Kardex } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanMateria = { clave: string; nombre: string; creditos: number; semestre: number };

type Destino = { clave: string; nombre: string; creditos: number };

type EquivalenciaEntry = {
  origen: { clave: string; nombre: string; creditos: number; _clave_ssp?: string };
  destino: Destino | Destino[];
  // When set, all listed claves must be in the kardex for this entry to fire.
  _requiere_claves?: string[];
};

type EquivalenciaEspecial = {
  origen: { clave: string; nombre: string; creditos: number; _clave_ssp?: string }[];
  destino: Destino;
  tipo_calificacion?: 'acreditado' | 'promedio';
};

type SinEquivalencia = { clave: string; nombre: string; creditos: number; razon: string };

type PlanData = {
  planInbi: { nombre: string; clave: string; materias: PlanMateria[] };
  planLib: { nombre: string; clave: string; materias: PlanMateria[] };
  equivalencias: {
    descripcion: string;
    equivalencias: EquivalenciaEntry[];
    equivalencias_especiales: EquivalenciaEspecial[];
    sin_equivalencia: SinEquivalencia[];
  };
};

// 'naranja' = equivalencia especial parcialmente cumplida (faltan materias del grupo)
type EstadoRow = 'verde' | 'amarillo' | 'rojo' | 'gris' | 'naranja';

type TablaRow = {
  estado: EstadoRow;
  inbi: { clave: string; nombre: string; creditos: number; calificacion: number | string | null; nc: number | null } | null;
  lib: { clave: string; nombre: string; creditos: number; calificacion: number | string | null } | null;
};

type MateriaPendienteDetalle = { clave: string; nombre: string; creditos: number };

type DemandaEntry = { nombre: string; creditos: number; alumnos: string[] };

type ConteoStorage = {
  codigo_alumno: string;
  total: number;
  materias: MateriaPendienteDetalle[];
  ncContabilizados: number;
  timestamp: string;
};

// Máximo de créditos del plan LIB que se contabilizan por alumno en la igualdad académica.
const MAX_NC_POR_ESTUDIANTE = 50;

// ─── Color helpers ─────────────────────────────────────────────────────────────

const COLOR: Record<EstadoRow, string> = {
  verde: '#d1fae5',
  amarillo: '#fef9c3',
  rojo: '#fee2e2',
  gris: '#f3f4f6',
  naranja: '#ffedd5',
};

const COLOR_BORDER: Record<EstadoRow, string> = {
  verde: '#6ee7b7',
  amarillo: '#fde68a',
  rojo: '#fca5a5',
  gris: '#e5e7eb',
  naranja: '#fb923c',
};

// ─── Equivalency logic ─────────────────────────────────────────────────────────

function resolverCalificacion(km: Kardex['materias'][0]): number | string | null {
  if (km.calificacion != null) return km.calificacion;
  const texto = `${km.calificacionTexto} ${km.tipo}`.toLowerCase();
  if (/no\s*acredit/i.test(texto)) return 'No Acreditado';
  if (/acredit/i.test(texto)) return 'Acreditado';
  return null;
}

function calcularFilas(kardex: Kardex | null, planData: PlanData): TablaRow[] {
  const rows: TablaRow[] = [];
  const { equivalencias: eqData } = planData;

  // Build lookup map: kardex materias by clave
  const kardexMap = new Map<string, Kardex['materias'][0]>();
  if (kardex) {
    for (const m of kardex.materias) kardexMap.set(m.clave, m);
  }

  const normStr = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Broad keyword match — used only in equivalencias_especiales where canonical claves
  // (PROYIM, PROYBH, PROYEF) may not match the real SIIAU clave in the PDF.
  const buscarPorNombre = (nombre: string): Kardex['materias'][0] | undefined => {
    const palabras = normStr(nombre).split(/\s+/).filter(p => p.length > 3);
    if (!palabras.length) return undefined;
    for (const m of kardexMap.values()) {
      if (palabras.every(p => normStr(m.nombre).includes(p))) return m;
    }
    return undefined;
  };

  // Exact-nombre match (accent/case insensitive) — safe fallback for regular equivalencias.
  // Unlike buscarPorNombre, this requires the full nombre to match, so
  // "Programación" will NOT match "Seminario de solución de problemas de Programación".
  const buscarNombreExacto = (nombre: string): Kardex['materias'][0] | undefined => {
    const n = normStr(nombre);
    for (const m of kardexMap.values()) {
      if (normStr(m.nombre) === n) return m;
    }
    return undefined;
  };

  // canonical clave → real kardex materia (populated during especiales loop).
  // Used by regular equivalencias so PROYIM/PROYBH/PROYEF can resolve to the
  // real materia without running buscarPorNombre on all equivalencias.
  const canonToReal = new Map<string, Kardex['materias'][0]>();

  // Track which LIB claves get covered by an equivalencia
  const libCubiertasClaves = new Set<string>();

  // Real kardex claves consumed by ANY equivalencia — prevents duplicate rojo rows.
  const realClavesCubiertas = new Set<string>();

  // Equivalencias especiales: requieren VARIOS orígenes para convalidar un destino.
  // Se evalúan primero. Soporta _clave_ssp igual que las equivalencias normales.
  // Track destinos parcialmente iniciados so the LIB gris loop can skip them.
  const libHandledParcial = new Set<string>();
  for (const esp of eqData.equivalencias_especiales ?? []) {
    const kms = esp.origen.map(o => {
      const lc = o._clave_ssp ?? o.clave;
      const byKey = kardexMap.get(lc);
      if (byKey) { canonToReal.set(lc, byKey); return byKey; }
      const byName = buscarPorNombre(o.nombre);
      if (byName) { canonToReal.set(lc, byName); return byName; }
      return undefined;
    });
    const allPresent = kms.every((km): km is NonNullable<typeof km> => km != null);
    const somePresent = kms.some(km => km != null);

    if (allPresent) {
      // Calificaciones de los orígenes (plan viejo). Para las equivalencias
      // especiales hay DOS (o más) calificaciones: se muestran TODAS.
      const calsOrigen = kms.map(km => resolverCalificacion(km!));
      const acreditado = esp.tipo_calificacion === 'acreditado';
      // Columna de calificación del plan viejo: ambas notas ("85 / 90").
      const calificacionInbi: number | string | null = acreditado
        ? 'Acreditado'
        : calsOrigen.some(c => c != null)
          ? calsOrigen.map(c => (c == null ? '—' : c)).join(' / ')
          : null;
      // Calificación que se asienta en el plan nuevo (destino): promedio de las
      // numéricas (o 'Acreditado').
      const nums = calsOrigen.filter((c): c is number => typeof c === 'number');
      const calificacionLib: number | string | null = acreditado
        ? 'Acreditado'
        : nums.length > 0
          ? Math.round(nums.reduce((s, c) => s + c, 0) / nums.length)
          : null;
      // NC: suma de los NC del kardex; si viene null (Acreditado sin NC en PDF)
      // se usa el crédito declarado en equivalencias.json para ese origen.
      const nc = kms.reduce((sum, km, i) => sum + (km!.nc ?? esp.origen[i].creditos ?? 0), 0);

      rows.push({
        estado: 'verde',
        inbi: {
          clave: esp.origen.map(o => o.clave).join(' + '),
          nombre: esp.origen.map(o => o.nombre).join(' + '),
          creditos: esp.origen.reduce((sum, o) => sum + o.creditos, 0),
          calificacion: calificacionInbi,
          nc,
        },
        lib: { clave: esp.destino.clave, nombre: esp.destino.nombre, creditos: esp.destino.creditos, calificacion: calificacionLib },
      });
      libCubiertasClaves.add(esp.destino.clave);
      for (const km of kms as NonNullable<(typeof kms)[0]>[]) realClavesCubiertas.add(km.clave);
    } else if (somePresent) {
      // Partial match: show which are present and which are missing.
      const presenteNombres = esp.origen
        .filter((_, i) => kms[i] != null)
        .map(o => o.nombre);
      const faltanNombres = esp.origen
        .filter((_, i) => kms[i] == null)
        .map(o => o.nombre);

      rows.push({
        estado: 'naranja',
        inbi: {
          clave: esp.origen.map(o => o.clave).join(' + '),
          nombre: `${presenteNombres.join(' + ')} (Falta: ${faltanNombres.join(', ')})`,
          creditos: esp.origen.reduce((sum, o) => sum + o.creditos, 0),
          calificacion: null,
          nc: null,
        },
        lib: { clave: esp.destino.clave, nombre: esp.destino.nombre, creditos: esp.destino.creditos },
      });
      libHandledParcial.add(esp.destino.clave);
      for (const km of kms) { if (km != null) realClavesCubiertas.add(km.clave); }
    }
  }

  // Process each equivalencia pair
  for (const eq of eqData.equivalencias) {
    // _requiere_claves: ALL listed claves must be in kardex (by clave or via canonToReal).
    if (eq._requiere_claves && !eq._requiere_claves.every(cl => kardexMap.has(cl) || canonToReal.has(cl))) continue;

    const lookupClave = eq.origen._clave_ssp ?? eq.origen.clave;
    // 1) exact clave, 2) via especiales discovery, 3) exact nombre (accent/case insensitive)
    const km = kardexMap.get(lookupClave)
      ?? canonToReal.get(lookupClave)
      ?? (() => {
        const found = buscarNombreExacto(eq.origen.nombre);
        if (found) canonToReal.set(lookupClave, found);
        return found;
      })();

    if (km) {
      realClavesCubiertas.add(km.clave);
      // Un origen puede convalidar uno o varios destinos (p.ej. los proyectos INBI).
      const destinos = Array.isArray(eq.destino) ? eq.destino : [eq.destino];
      for (const destino of destinos) {
        // Credits differ → partial equivalence (amarillo); equal → direct (verde)
        const estado: EstadoRow = eq.origen.creditos !== destino.creditos ? 'amarillo' : 'verde';
        rows.push({
          estado,
          inbi: { clave: km.clave, nombre: km.nombre, creditos: eq.origen.creditos, calificacion: resolverCalificacion(km), nc: km.nc },
          lib: { clave: destino.clave, nombre: destino.nombre, creditos: destino.creditos },
        });
        libCubiertasClaves.add(destino.clave);
      }
    }
  }

  // Kardex materias explicitly listed as sin equivalencia — exact clave only.
  if (kardex) {
    for (const sinEq of eqData.sin_equivalencia) {
      const km = kardexMap.get(sinEq.clave);
      if (km) {
        realClavesCubiertas.add(km.clave);
        rows.push({
          estado: 'rojo',
          inbi: { clave: km.clave, nombre: km.nombre, creditos: sinEq.creditos, calificacion: resolverCalificacion(km), nc: km.nc },
          lib: null,
        });
      }
    }

    // Kardex materias not found in any equivalencia list → show as rojo
    const todasOriginClaves = new Set([
      ...eqData.equivalencias.flatMap(eq => [eq.origen.clave, eq.origen._clave_ssp ?? '']),
      ...eqData.sin_equivalencia.map(s => s.clave),
    ]);
    for (const km of kardex.materias) {
      if (realClavesCubiertas.has(km.clave)) continue;
      if (!todasOriginClaves.has(km.clave)) {
        rows.push({
          estado: 'rojo',
          inbi: { clave: km.clave, nombre: km.nombre, creditos: km.nc ?? 0, calificacion: resolverCalificacion(km), nc: km.nc },
          lib: null,
        });
      }
    }
  }

  // LIB materias not covered by any matched equivalencia → gris (pending)
  for (const libM of planData.planLib.materias) {
    if (!libCubiertasClaves.has(libM.clave) && !libHandledParcial.has(libM.clave)) {
      rows.push({
        estado: 'gris',
        inbi: null,
        lib: { clave: libM.clave, nombre: libM.nombre, creditos: libM.creditos },
      });
    }
  }

  return rows;
}

function calcularPendientes(filas: TablaRow[], planData: PlanData): string[] {
  const cubiertasClaves = new Set<string>();
  for (const f of filas) {
    if (f.lib && (f.estado === 'verde' || f.estado === 'amarillo')) {
      cubiertasClaves.add(f.lib.clave);
    }
  }
  return planData.planLib.materias
    .filter(m => !cubiertasClaves.has(m.clave))
    .map(m => m.nombre);
}

// Devuelve solo las materias que caben dentro del tope de MAX_NC_POR_ESTUDIANTE créditos,
// tomándolas en el orden del plan LIB (por semestre).
function calcularContabilizados(
  filas: TablaRow[],
  planData: PlanData,
): { materias: MateriaPendienteDetalle[]; nc: number } {
  const cubiertasClaves = new Set<string>();
  for (const f of filas) {
    if (f.lib && (f.estado === 'verde' || f.estado === 'amarillo')) {
      cubiertasClaves.add(f.lib.clave);
    }
  }
  let nc = 0;
  const materias: MateriaPendienteDetalle[] = [];
  for (const m of planData.planLib.materias) {
    if (cubiertasClaves.has(m.clave)) continue;
    // Stop before exceeding the cap — don't add a subject that would push total over the limit.
    if (nc + m.creditos > MAX_NC_POR_ESTUDIANTE) break;
    materias.push({ clave: m.clave, nombre: m.nombre, creditos: m.creditos });
    nc += m.creditos;
  }
  return { materias, nc };
}

// ─── LocalStorage helpers ──────────────────────────────────────────────────────

function guardarConteo(conteo: ConteoStorage) {
  localStorage.setItem('cambio_plan_conteo_pendientes', JSON.stringify(conteo));
}

function leerDemanda(): Record<string, DemandaEntry> {
  try {
    const raw = localStorage.getItem('cambio_plan_demanda');
    return raw ? (JSON.parse(raw) as Record<string, DemandaEntry>) : {};
  } catch { return {}; }
}

function guardarDemanda(d: Record<string, DemandaEntry>) {
  localStorage.setItem('cambio_plan_demanda', JSON.stringify(d));
}

function leerConteo(): ConteoStorage | null {
  try {
    const raw = localStorage.getItem('cambio_plan_conteo_pendientes');
    return raw ? (JSON.parse(raw) as ConteoStorage) : null;
  } catch {
    return null;
  }
}

function leerFolio(): number {
  try {
    return parseInt(localStorage.getItem('folio_solicitudes') ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function guardarFolio(n: number) {
  localStorage.setItem('folio_solicitudes', String(n));
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function fechaEspanol() {
  const hoy = new Date();
  return `${hoy.getDate()} de ${MESES_ES[hoy.getMonth()]} de ${hoy.getFullYear()}`;
}

// ─── PDF generation ────────────────────────────────────────────────────────────

async function generarPdfSolicitud(
  kardex: Kardex,
  filas: TablaRow[],
  folio: number,
): Promise<Uint8Array> {
  const res = await fetch('/api/hoja-membretada');
  if (!res.ok) throw new Error('No se pudo cargar la hoja membretada.');
  const hojaBytes = await res.arrayBuffer();

  // Keep the letterhead as a template so we can clone it for each new page.
  const template = await PDFDocument.load(hojaBytes, { ignoreEncryption: true });

  const doc = await PDFDocument.create();
  const [firstPage] = await doc.copyPages(template, [0]);
  doc.addPage(firstPage);

  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { width: W, height: H } = doc.getPage(0).getSize();

  const LEFT = 70;
  const RIGHT = W - 65;
  const CONTENT_W = RIGHT - LEFT;

  // y below which the footer graphic lives — never write past this boundary.
  // Adjust this value if your footer is taller or shorter.
  const FOOTER_LIMIT = 105;
  const TOP_P1 = H - 135; // content start on page 1 (below full header)
  const TOP_PN = H - 150; // content start on pages 2+ (extra top margin to clear the header)

  // `page` is intentionally mutable so every helper always writes to the current page.
  let page = doc.getPage(0);
  let y = TOP_P1;

  const draw = (text: string, x: number, yPos: number, size = 9, bold = false) =>
    page.drawText(text, { x, y: yPos, size, font: bold ? helveticaBold : helvetica, color: rgb(0, 0, 0) });

  const hline = (yPos: number, thickness: number, gray: number) =>
    page.drawLine({ start: { x: LEFT, y: yPos }, end: { x: RIGHT, y: yPos }, thickness, color: rgb(gray, gray, gray) });

  // Clone the letterhead template and start fresh at the top of the content area.
  const addPage = async () => {
    const [p] = await doc.copyPages(template, [0]);
    doc.addPage(p);
    page = doc.getPage(doc.getPageCount() - 1);
    y = TOP_PN;
  };

  // True when `needed` more points would bleed into the footer.
  const needsBreak = (needed: number) => y - needed < FOOTER_LIMIT;

  // ── Column geometry ────────────────────────────────────────────────────────

  const COL_ASIG_W  = Math.floor(CONTENT_W * 0.28);
  const COL_CLAVE_W = 48;
  const COL_CALIF_W = 40;
  const COL_NC_W    = 28;
  const SEP_W       = 10;
  const COL_ASIG2_W = Math.floor(CONTENT_W * 0.25);
  const COL_CLAVE2_W = 48;

  const xA1  = LEFT;
  const xC1  = xA1  + COL_ASIG_W;
  const xK1  = xC1  + COL_CLAVE_W;
  const xN1  = xK1  + COL_CALIF_W;
  const xSep = xN1  + COL_NC_W + 4;
  const xA2  = xSep + SEP_W;
  const xC2  = xA2  + COL_ASIG2_W;
  const xK2  = xC2  + COL_CLAVE2_W;

  const ROW_H  = 11;
  const LINE_H = 8.5;

  // Draws the two-row table header (panel labels + column names) at the current y
  // and advances y past the bottom separator line.
  const drawTableHeaders = () => {
    hline(y + 10, 0.5, 0.5);
    draw('INBI — Programa Origen', LEFT, y, 8, true);
    draw('LIB — Programa Destino', xA2,  y, 8, true);
    y -= ROW_H;

    hline(y + 10, 0.3, 0.7);
    draw('Asignatura', xA1, y, 7, true);
    draw('Clave',      xC1, y, 7, true);
    draw('Calif.',     xK1, y, 7, true);
    draw('NC',         xN1, y, 7, true);
    draw('Asignatura', xA2, y, 7, true);
    draw('Clave',      xC2, y, 7, true);
    draw('NC',         xK2, y, 7, true);
    y -= ROW_H;

    hline(y + 10, 0.5, 0.3);
  };

  // Word-wrap helper — unchanged logic.
  const wrapText = (text: string, maxW: number, size: number, font: typeof helvetica): string[] => {
    const maxLineW = maxW - 4;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let actual = '';
    for (const word of words) {
      const tentativa = actual ? `${actual} ${word}` : word;
      if (font.widthOfTextAtSize(tentativa, size) <= maxLineW) { actual = tentativa; continue; }
      if (actual) lines.push(actual);
      let resto = word;
      while (font.widthOfTextAtSize(resto, size) > maxLineW && resto.length > 1) {
        let i = resto.length - 1;
        while (i > 1 && font.widthOfTextAtSize(resto.slice(0, i), size) > maxLineW) i--;
        lines.push(resto.slice(0, i));
        resto = resto.slice(i);
      }
      actual = resto;
    }
    if (actual) lines.push(actual);
    return lines.length ? lines : [''];
  };

  // ── Page 1: folio, date, recipient, opening paragraph ─────────────────────

  const folioStr = `CUCEI/SAC/INBI/LIB/${folio}/2026`;
  const fechaStr = fechaEspanol();

  draw(folioStr, RIGHT - helveticaBold.widthOfTextAtSize(folioStr, 9), y, 9, true);
  y -= 12;
  const fechaLine = `Guadalajara, Jal., ${fechaStr}`;
  draw(fechaLine, RIGHT - helvetica.widthOfTextAtSize(fechaLine, 9), y, 9);
  y -= 22;

  draw('Ing. Edson Aldair Vital Díaz', LEFT, y, 9, true);
  y -= 12;
  draw('Coordinador de Control Escolar', LEFT, y, 9);
  y -= 12;
  draw('Centro de Ciencias Exactas e Ingenierías - Universidad de Guadalajara', LEFT, y, 9);
  y -= 12;
  draw('P R E S E N T E:', LEFT, y, 9, true);
  y -= 20;

  for (const linea of [
    `Solicito su apoyo para realizar la igualdad académica para el estudiante de`,
    `Ingeniería Biomédica: ${kardex.estudiante.nombre ?? ''}, con código: ${kardex.estudiante.codigo ?? ''},`,
    `de las siguientes asignaturas:`,
  ]) {
    draw(linea, LEFT, y, 9);
    y -= 13;
  }
  y -= 6;

  // ── Equivalency table ──────────────────────────────────────────────────────

  const equivFilas = filas.filter(f => f.estado === 'verde' || f.estado === 'amarillo' || f.estado === 'naranja');

  // Need room for both header rows before even starting the table.
  if (needsBreak(ROW_H * 2 + ROW_H)) await addPage();
  drawTableHeaders();

  for (const row of equivFilas) {
    const inbiLineas = wrapText(row.inbi?.nombre ?? '', COL_ASIG_W,  7, helvetica);
    const libLineas  = wrapText(row.lib?.nombre  ?? '', COL_ASIG2_W, 7, helvetica);
    const clavInbi   = wrapText(row.inbi?.clave  ?? '', COL_CLAVE_W,  7, helvetica);
    const clavLib    = wrapText(row.lib?.clave   ?? '', COL_CLAVE2_W, 7, helvetica);
    const numLineas  = Math.max(inbiLineas.length, libLineas.length, clavInbi.length, clavLib.length);
    const rowH       = (numLineas - 1) * LINE_H + ROW_H;

    if (needsBreak(rowH + 2)) {
      // Close the table on the current page, then continue on a fresh letterhead page.
      hline(y + 9, 0.5, 0.3);
      await addPage();
      drawTableHeaders();
    }

    inbiLineas.forEach((l, i) => draw(l, xA1, y - i * LINE_H, 7));
    libLineas.forEach( (l, i) => draw(l, xA2, y - i * LINE_H, 7));
    clavInbi.forEach(  (l, i) => draw(l, xC1, y - i * LINE_H, 7));
    clavLib.forEach(   (l, i) => draw(l, xC2, y - i * LINE_H, 7));
    draw(
      row.inbi?.calificacion == null ? '' :
      typeof row.inbi.calificacion === 'string'
        ? (String(row.inbi.calificacion).toLowerCase().startsWith('no') ? 'No Acred.' : 'Acred.')
        : String(row.inbi.calificacion),
      xK1, y, 7,
    );
    draw(row.inbi?.nc           != null ? String(row.inbi.nc)           : '', xN1, y, 7);
    draw(row.lib?.creditos      != null ? String(row.lib.creditos)      : '', xK2, y, 7);

    y -= rowH;
    hline(y + 9, 0.2, 0.85);
  }

  hline(y + 9, 0.5, 0.3); // bottom table border
  y -= 18;

  // ── Closing paragraph + signature — keep together if they fit ──────────────

  const cierreLines = [
    'Las cuales están registradas en el kárdex de sus estudios previos en:',
    'Ingeniería Biomédica (INBI). Se anexa copia del kárdex del estudiante.',
    '',
    'Sin más por el momento agradezco su apoyo, y quedo atento para cualquier aclaración.',
  ];
  const pieLines = [
    'Atentamente',
    'Piensa y Trabaja',
    '"40 años de la Feria Internacional del Libro de Guadalajara"',
    `Guadalajara, Jal., ${fechaStr}`,
  ];
  const firmanteNombre = 'Mtro. Victor Ernesto Moreno Gonzalez';
  const firmanteCargo  = 'Coordinador de ingeniería biomédica';

  // Estimated height: cierre + gap + pieLines + gap + firmante (2 lines)
  const closingH = (cierreLines.length + pieLines.length + 2) * 13 + 30;
  if (needsBreak(closingH)) await addPage();

  for (const linea of cierreLines) {
    if (linea) draw(linea, LEFT, y, 9);
    y -= 13;
  }
  y -= 10;

  // Pie centrado entre LEFT y RIGHT
  for (const linea of pieLines) {
    const bold = linea === 'Atentamente' || linea === 'Piensa y Trabaja';
    const textW = (bold ? helveticaBold : helvetica).widthOfTextAtSize(linea, 9);
    draw(linea, LEFT + (CONTENT_W - textW) / 2, y, 9, bold);
    y -= 13;
  }
  y -= 8;

  // Firmante centrado
  draw(
    firmanteNombre,
    LEFT + (CONTENT_W - helveticaBold.widthOfTextAtSize(firmanteNombre, 9)) / 2,
    y, 9, true,
  );
  y -= 13;
  draw(
    firmanteCargo,
    LEFT + (CONTENT_W - helvetica.widthOfTextAtSize(firmanteCargo, 9)) / 2,
    y, 9,
  );

  return doc.save();
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function CambioPlan() {
  const [kardex, setKardex] = useState<Kardex | null>(null);
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [conteoPrevio, setConteoPrevio] = useState<ConteoStorage | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Edición manual de la tabla ────────────────────────────────────────────────
  const [modoEdicion, setModoEdicion] = useState(false);
  const [filasOverride, setFilasOverride] = useState<TablaRow[] | null>(null);
  const [formNueva, setFormNueva] = useState(false);
  const [nuevaFila, setNuevaFila] = useState({
    inbiNombre: '', inbiClave: '', inbiCalif: '', inbiNc: '', libClave: '',
  });

  useEffect(() => {
    fetch('/api/leer-datos-plan')
      .then(r => r.json())
      .then((data: PlanData) => setPlanData(data))
      .catch(err => setPlanError((err as Error).message));

    setConteoPrevio(leerConteo());
  }, []);

  // Reset edición manual cuando se sube un kardex nuevo
  useEffect(() => {
    setFilasOverride(null);
    setModoEdicion(false);
    setFormNueva(false);
  }, [kardex]);

  // Computed equivalency table rows (base)
  const filas: TablaRow[] = planData ? calcularFilas(kardex, planData) : [];

  // filasActivas = override si el usuario editó manualmente, o el cálculo automático
  const filasActivas: TablaRow[] = filasOverride ?? filas;

  const pendientes = planData && kardex ? calcularPendientes(filasActivas, planData) : [];
  const contabilizados = planData && kardex
    ? calcularContabilizados(filasActivas, planData)
    : { materias: [], nc: 0 };
  const contabilizadasSet = new Set(contabilizados.materias.map(m => m.nombre));

  // Diagnostic: per-especial lookup results (shows clave match + nombre-fallback match)
  const diagnosticoEspeciales = kardex && planData
    ? (() => {
        const map = new Map<string, Kardex['materias'][0]>();
        for (const m of kardex.materias) map.set(m.clave, m);
        const ns = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const porNombre = (nombre: string) => {
          const p = ns(nombre).split(/\s+/).filter(w => w.length > 3);
          if (!p.length) return undefined;
          for (const m of map.values()) if (p.every(w => ns(m.nombre).includes(w))) return m;
          return undefined;
        };
        return (planData.equivalencias.equivalencias_especiales ?? []).map(esp => ({
          destino: esp.destino.nombre,
          origen: esp.origen.map(o => {
            const lc = o._clave_ssp ?? o.clave;
            const byKey = map.get(lc);
            const byName = byKey ? undefined : porNombre(o.nombre);
            const found = byKey ?? byName;
            return { clave: o.clave, lookupClave: lc, nombre: o.nombre, encontrado: found != null, viaNombre: byName != null, realClave: found?.clave };
          }),
        }));
      })()
    : null;

  // ── Kardex upload ─────────────────────────────────────────────────────────────

  const procesarArchivo = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setKardex(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/kardex', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al procesar el kardex.');
      setKardex(json as Kardex);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, []);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) procesarArchivo(f);
    e.target.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) procesarArchivo(f);
  };

  // ── Conteo ────────────────────────────────────────────────────────────────────

  const actualizarConteo = useCallback(() => {
    if (!kardex || !planData) return;
    const { materias, nc } = calcularContabilizados(filas, planData);
    const codigo = kardex.estudiante.codigo ?? '';
    const conteo: ConteoStorage = {
      codigo_alumno: codigo,
      total: materias.length,
      materias,
      ncContabilizados: nc,
      timestamp: new Date().toISOString(),
    };
    guardarConteo(conteo);
    setConteoPrevio(conteo);

    // Actualizar mapa global de demanda (acumula todos los alumnos procesados)
    const demanda = leerDemanda();
    // Limpiar entradas previas de este alumno antes de re-añadir
    for (const entry of Object.values(demanda)) {
      entry.alumnos = entry.alumnos.filter(a => a !== codigo);
    }
    for (const m of materias) {
      if (!demanda[m.clave]) demanda[m.clave] = { nombre: m.nombre, creditos: m.creditos, alumnos: [] };
      if (!demanda[m.clave].alumnos.includes(codigo)) demanda[m.clave].alumnos.push(codigo);
    }
    // Eliminar entradas que quedaron sin alumnos
    for (const k of Object.keys(demanda)) {
      if (demanda[k].alumnos.length === 0) delete demanda[k];
    }
    guardarDemanda(demanda);
  }, [kardex, planData, filasActivas]);

  // ── Edición manual: eliminar / agregar fila ───────────────────────────────────

  const eliminarFila = useCallback((idx: number) => {
    setFilasOverride(prev => (prev ?? filas).filter((_, i) => i !== idx));
  }, [filas]);

  const agregarFila = useCallback(() => {
    if (!planData || !nuevaFila.libClave) return;
    const libMateria = planData.planLib.materias.find(m => m.clave === nuevaFila.libClave);
    if (!libMateria) return;
    const califStr = nuevaFila.inbiCalif.trim();
    const calificacion: number | string | null = /acredit/i.test(califStr)
      ? 'Acreditado'
      : (parseInt(califStr, 10) || null);
    const nc = parseInt(nuevaFila.inbiNc, 10) || null;
    const newRow: TablaRow = {
      estado: 'verde',
      inbi: {
        clave: nuevaFila.inbiClave.toUpperCase().trim(),
        nombre: nuevaFila.inbiNombre.trim(),
        creditos: nc ?? libMateria.creditos,
        calificacion,
        nc,
      },
      lib: { clave: libMateria.clave, nombre: libMateria.nombre, creditos: libMateria.creditos },
    };
    setFilasOverride(prev => [...(prev ?? filas), newRow]);
    setNuevaFila({ inbiNombre: '', inbiClave: '', inbiCalif: '', inbiNc: '', libClave: '' });
    setFormNueva(false);
  }, [planData, filas, nuevaFila]);

  // ── PDF ───────────────────────────────────────────────────────────────────────

  const handleGenerarPdf = useCallback(async () => {
    if (!kardex || !planData) return;
    setGeneratingPdf(true);
    setPdfError(null);
    try {
      const folio = leerFolio() + 1;
      const pdfBytes = await generarPdfSolicitud(kardex, filasActivas, folio);
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fecha = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `solicitud_igualdad_${kardex.estudiante.codigo ?? 'alumno'}_${fecha}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      guardarFolio(folio);
    } catch (err) {
      setPdfError((err as Error).message);
    } finally {
      setGeneratingPdf(false);
    }
  }, [kardex, planData, filasActivas]);

  // ── Derived stats ─────────────────────────────────────────────────────────────

  const totalLib = planData?.planLib.materias.length ?? 0;
  const totalEquivalentes = filasActivas.filter(f => f.estado === 'verde' || f.estado === 'amarillo').length;
  const pctAvance = totalLib > 0 ? Math.round((totalEquivalentes / totalLib) * 100) : 0;

  // ── Styles ────────────────────────────────────────────────────────────────────

  const sectionCard: CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '20px 24px',
    marginBottom: 24,
    background: '#fff',
  };

  const sectionTitle: CSSProperties = {
    margin: '0 0 14px 0',
    fontSize: 16,
    fontWeight: 700,
    color: '#1e3a5f',
    borderBottom: '2px solid #1e3a5f',
    paddingBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const badge: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: '#1e3a5f',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  };

  const th: CSSProperties = {
    padding: '5px 8px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    background: '#1e3a5f',
    color: '#fff',
  };

  const td: CSSProperties = {
    padding: '4px 8px',
    fontSize: 12,
    borderBottom: '1px solid #e5e7eb',
    color: '#000',
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main style={{ maxWidth: 1100, margin: '40px auto', padding: '0 16px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: '0 0 4px 0', fontSize: 22, color: '#1e3a5f' }}>
          Cambio de Plan de Estudios — Igualdad Académica
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
          INBI → LIB · Ingeniería Biomédica · CUCEI · Universidad de Guadalajara
        </p>
      </div>

      {planError && (
        <p style={{ color: 'crimson', background: '#fee2e2', padding: '10px 14px', borderRadius: 6 }}>
          Error al cargar datos del plan: {planError}
        </p>
      )}

      {/* ── SECCIÓN 1 — Subir Kardex ─────────────────────────────────────────── */}
      <div style={sectionCard}>
        <h2 style={sectionTitle}>
          <span style={badge}>1</span>
          Subir Kardex del Alumno
        </h2>

        {/* Drag & Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? '#1e3a5f' : '#cbd5e1'}`,
            borderRadius: 8,
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragging ? '#eff6ff' : '#f8fafc',
            transition: 'all .15s',
            marginBottom: 14,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            {uploading ? 'Procesando…' : 'Arrastra el PDF del kardex aquí, o haz clic para seleccionar'}
          </p>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 11 }}>PDF o imagen (SIIAU)</p>
        </div>

        {uploading && (
          <p style={{ color: '#1e3a5f', fontSize: 13 }}>Extrayendo datos del kardex…</p>
        )}
        {uploadError && (
          <p style={{ color: 'crimson', fontSize: 13, background: '#fee2e2', padding: '8px 12px', borderRadius: 6 }}>
            {uploadError}
          </p>
        )}

        {kardex && (
          <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 6, padding: '10px 14px' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#065f46' }}>
              {kardex.estudiante.nombre}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#047857' }}>
              Código: {kardex.estudiante.codigo} · Carrera: {kardex.estudiante.carrera} ·{' '}
              {kardex.totalMaterias} materias en kardex
            </p>
          </div>
        )}
      </div>

      {/* ── SECCIÓN 2 — Tabla de Equivalencias ───────────────────────────────── */}
      <div style={sectionCard}>
        <h2 style={sectionTitle}>
          <span style={badge}>2</span>
          Tabla de Equivalencias con Código de Colores
        </h2>

        {/* Leyenda */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          {(
            [
              ['verde', 'Equivalencia directa (iguales NC)'],
              ['amarillo', 'Equivalencia parcial (NC distinto)'],
              ['naranja', 'Equivalencia especial incompleta (faltan materias)'],
              ['rojo', 'Sin equivalencia en LIB'],
              ['gris', 'Materia LIB no cubierta (pendiente)'],
            ] as [EstadoRow, string][]
          ).map(([estado, label]) => (
            <div key={estado} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                background: COLOR[estado],
                border: `1px solid ${COLOR_BORDER[estado]}`,
                borderRadius: 3,
              }} />
              {label}
            </div>
          ))}
        </div>

        {/* Toolbar de edición manual */}
        {kardex && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                if (!modoEdicion) {
                  if (!filasOverride) setFilasOverride(filas);
                  setModoEdicion(true);
                } else {
                  setModoEdicion(false);
                  setFormNueva(false);
                }
              }}
              style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                background: modoEdicion ? '#1e3a5f' : '#f1f5f9',
                color: modoEdicion ? '#fff' : '#1e3a5f',
                border: '1px solid #1e3a5f',
              }}
            >
              {modoEdicion ? 'Cerrar edición' : 'Editar tabla'}
            </button>
            {filasOverride && (
              <button
                onClick={() => { setFilasOverride(null); setModoEdicion(false); setFormNueva(false); }}
                style={{ padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', fontWeight: 600 }}
              >
                Restablecer original
              </button>
            )}
            {filasOverride && !modoEdicion && (
              <span style={{ fontSize: 12, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 5, padding: '3px 8px' }}>
                Tabla con ediciones manuales activas
              </span>
            )}
          </div>
        )}

        {!planData ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>Cargando datos del plan…</p>
        ) : (
          <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th colSpan={4} style={{ ...th, textAlign: 'center', borderRight: '3px solid #e5e7eb' }}>
                    Programa Origen: Ingeniería Biomédica (INBI)
                  </th>
                  <th colSpan={3} style={{ ...th, textAlign: 'center' }}>
                    Programa Destino: Licenciatura en Ingeniería Biomédica (LIB)
                  </th>
                </tr>
                <tr>
                  {['Asignatura', 'Clave', 'Calificación', 'NC'].map(h => (
                    <th key={h} style={{ ...th, fontSize: 10, background: '#334155', borderRight: h === 'NC' ? '3px solidrgb(0, 0, 0)' : undefined }}>{h}</th>
                  ))}
                  {['Asignatura', 'Clave', 'NC'].map(h => (
                    <th key={h} style={{ ...th, fontSize: 10, background: '#334155' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasActivas.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: 'center', padding: 20 }}>
                      Sube un kardex para ver las equivalencias
                    </td>
                  </tr>
                ) : (
                  filasActivas.map((row, i) => (
                    <tr key={i} style={{ background: COLOR[row.estado], borderBottom: `1px solid ${COLOR_BORDER[row.estado]}` }}>
                      <td style={{ ...td, maxWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                          {modoEdicion && (
                            <button
                              onClick={() => eliminarFila(i)}
                              title="Eliminar fila"
                              style={{ flexShrink: 0, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 3, width: 16, height: 16, cursor: 'pointer', fontSize: 11, fontWeight: 700, lineHeight: 1, padding: 0, marginTop: 1 }}
                            >
                              ×
                            </button>
                          )}
                          <span>{row.inbi?.nombre ?? '—'}</span>
                        </div>
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{row.inbi?.clave ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {row.inbi?.calificacion != null ? row.inbi.calificacion : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', borderRight: '3px solid #e5e7eb' }}>
                        {row.inbi?.nc != null ? row.inbi.nc : '—'}
                      </td>
                      <td style={{ ...td, maxWidth: 220 }}>{row.lib?.nombre ?? '—'}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{row.lib?.clave ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {row.lib?.creditos != null ? row.lib.creditos : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Formulario para agregar fila manualmente */}
          {modoEdicion && (
            <div style={{ marginTop: 12 }}>
              {!formNueva ? (
                <button
                  onClick={() => setFormNueva(true)}
                  style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}
                >
                  + Agregar equivalencia
                </button>
              ) : (
                <div style={{ border: '1px solid #6ee7b7', borderRadius: 8, padding: '14px 16px', background: '#f0fdf4', marginTop: 8 }}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#065f46' }}>
                    Nueva equivalencia (se agrega como verde)
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 10 }}>
                    {[
                      { label: 'Clave INBI', key: 'inbiClave', placeholder: 'Ej. I5882' },
                      { label: 'Nombre INBI', key: 'inbiNombre', placeholder: 'Nombre de la materia' },
                      { label: 'Calificación', key: 'inbiCalif', placeholder: 'Ej. 95 o Acreditado' },
                      { label: 'NC INBI', key: 'inbiNc', placeholder: 'Ej. 8' },
                    ].map(({ label, key, placeholder }) => (
                      <div key={key}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>{label}</label>
                        <input
                          value={nuevaFila[key as keyof typeof nuevaFila]}
                          onChange={e => setNuevaFila(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={placeholder}
                          style={{ width: '100%', padding: '5px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 5, boxSizing: 'border-box' as const, color: '#111' }}
                        />
                      </div>
                    ))}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>Materia LIB</label>
                      <select
                        value={nuevaFila.libClave}
                        onChange={e => setNuevaFila(prev => ({ ...prev, libClave: e.target.value }))}
                        style={{ width: '100%', padding: '5px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 5, boxSizing: 'border-box' as const, color: '#111' }}
                      >
                        <option value="">— seleccionar —</option>
                        {planData?.planLib.materias.map(m => (
                          <option key={m.clave} value={m.clave}>{m.nombre} ({m.clave})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={agregarFila}
                      disabled={!nuevaFila.libClave || !nuevaFila.inbiNombre}
                      style={{ padding: '6px 16px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer', background: '#065f46', color: '#fff', border: 'none', opacity: (!nuevaFila.libClave || !nuevaFila.inbiNombre) ? 0.5 : 1 }}
                    >
                      Agregar
                    </button>
                    <button
                      onClick={() => { setFormNueva(false); setNuevaFila({ inbiNombre: '', inbiClave: '', inbiCalif: '', inbiNc: '', libClave: '' }); }}
                      style={{ padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </>
        )}
      </div>

      {/* ── DIAGNÓSTICO equivalencias especiales ─────────────────────────────── */}
      {diagnosticoEspeciales && (
        <details style={{ marginBottom: 24 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: '#4b5563', padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
            🔍 Diagnóstico de equivalencias especiales
          </summary>
          <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: 14, background: '#fff' }}>
            {diagnosticoEspeciales.map((esp, i) => (
              <div key={i} style={{ marginBottom: 12, fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: '#1e3a5f' }}>
                  → {esp.destino}
                </div>
                {esp.origen.map(o => (
                  <div key={o.clave} style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 12, marginBottom: 2 }}>
                    <span style={{
                      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                      background: o.encontrado ? '#22c55e' : '#ef4444', flexShrink: 0,
                    }} />
                    <span style={{ fontFamily: 'monospace', color: '#374151' }}>{o.lookupClave}</span>
                    <span style={{ color: '#6b7280' }}>{o.nombre}</span>
                    {o.viaNombre && o.realClave && (
                      <span style={{ color: '#d97706', fontStyle: 'italic' }}>
                        — clave real: <code>{o.realClave}</code> (encontrado por nombre)
                      </span>
                    )}
                    {!o.encontrado && (
                      <span style={{ color: '#ef4444', fontStyle: 'italic' }}>— no encontrado en kardex</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: '#6b7280' }}>
                Todas las materias del kardex ({kardex?.materias.length ?? 0})
              </summary>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {kardex?.materias.map((m, idx) => (
                  <span key={idx} style={{ fontFamily: 'monospace', fontSize: 10, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 3, padding: '1px 5px' }}>
                    {m.clave}
                  </span>
                ))}
              </div>
            </details>
          </div>
        </details>
      )}

      {/* ── SECCIÓN 3 — Materias Pendientes ──────────────────────────────────── */}
      <div style={sectionCard}>
        <h2 style={sectionTitle}>
          <span style={badge}>3</span>
          Materias Pendientes por Cursar
        </h2>

        {conteoPrevio && (
          <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#854d0e' }}>
            Conteo guardado para <strong>{conteoPrevio.codigo_alumno}</strong>:{' '}
            <strong>{conteoPrevio.total} materias</strong>
            {conteoPrevio.ncContabilizados != null && (
              <> · <strong>{conteoPrevio.ncContabilizados} NC</strong> (máx. {MAX_NC_POR_ESTUDIANTE} NC)</>
            )}
            {' '}— {new Date(conteoPrevio.timestamp).toLocaleString('es-MX')}
          </div>
        )}

        {!kardex ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>Sube un kardex para calcular las materias pendientes.</p>
        ) : (
          <>
            {/* Contador principal — solo las materias contabilizadas (dentro del tope de NC) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{
                background: contabilizados.materias.length === 0 ? '#d1fae5' : '#fee2e2',
                border: `1px solid ${contabilizados.materias.length === 0 ? '#6ee7b7' : '#fca5a5'}`,
                borderRadius: 8,
                padding: '10px 18px',
                fontWeight: 700,
                fontSize: 18,
                color: contabilizados.materias.length === 0 ? '#065f46' : '#991b1b',
              }}>
                {contabilizados.materias.length} materias contabilizadas
              </div>
              <div style={{ fontSize: 13, color: '#374151' }}>
                <span style={{ fontWeight: 700 }}>{contabilizados.nc}</span>
                <span style={{ color: '#6b7280' }}> / {MAX_NC_POR_ESTUDIANTE} NC máx. por alumno</span>
                {pendientes.length > contabilizados.materias.length && (
                  <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: 12 }}>
                    (+{pendientes.length - contabilizados.materias.length} fuera del tope)
                  </span>
                )}
              </div>
              <button
                onClick={actualizarConteo}
                style={{
                  padding: '8px 14px',
                  background: '#1e3a5f',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Actualizar y guardar conteo
              </button>
            </div>

            {pendientes.length > 0 && (
              <div style={{ columns: 2, columnGap: 24 }}>
                {pendientes.map((m, i) => {
                  const contabilizada = contabilizadasSet.has(m);
                  return (
                    <div key={i} style={{
                      fontSize: 12,
                      padding: '4px 0',
                      borderBottom: '1px solid #f3f4f6',
                      breakInside: 'avoid',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 6,
                      opacity: contabilizada ? 1 : 0.45,
                    }}>
                      <span style={{ color: contabilizada ? '#ef4444' : '#9ca3af', fontWeight: 700, flexShrink: 0 }}>•</span>
                      <span>{m}</span>
                      {!contabilizada && (
                        <span style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', marginLeft: 'auto', flexShrink: 0 }}>
                          fuera del tope
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── SECCIÓN 4 — Preview Informativo ──────────────────────────────────── */}
      <div style={{ ...sectionCard, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <h2 style={{ ...sectionTitle, color: '#0c4a6e', borderBottomColor: '#0ea5e9', margin: 0 }}>
            <span style={{ ...badge, background: '#0ea5e9' }}>4</span>
            Vista Previa Informativa
          </h2>
          <span style={{
            fontSize: 11,
            background: '#fef9c3',
            border: '1px solid #fde68a',
            color: '#713f12',
            padding: '3px 10px',
            borderRadius: 20,
            fontWeight: 600,
          }}>
            No constituye trámite oficial
          </span>
        </div>

        {!planData || !kardex ? (
          <p style={{ color: '#0369a1', fontSize: 13 }}>
            {!planData ? 'Cargando datos…' : 'Sube un kardex para ver el resumen de avance.'}
          </p>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
              {[
                { label: 'Materias equivalentes', value: totalEquivalentes, color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
                { label: 'Total materias LIB', value: totalLib, color: '#1e3a5f', bg: '#dbeafe', border: '#93c5fd' },
                { label: 'Pendientes por cursar', value: pendientes.length, color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
                { label: 'Avance en plan LIB', value: `${pctAvance}%`, color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
              ].map(({ label, value, color, bg, border }) => (
                <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151', marginBottom: 4 }}>
                <span>Avance en el Plan LIB</span>
                <span style={{ fontWeight: 700 }}>{pctAvance}%</span>
              </div>
              <div style={{ height: 10, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${pctAvance}%`, height: '100%', background: 'linear-gradient(90deg, #0ea5e9, #22c55e)', borderRadius: 99, transition: 'width .4s' }} />
              </div>
            </div>

            {/* Créditos contabilizados y semestres estimados */}
            {(() => {
              const ncPorSemestre = 48;
              const semestresEst = contabilizados.nc > 0 ? Math.ceil(contabilizados.nc / ncPorSemestre) : 0;
              return (
                <p style={{ fontSize: 12, color: '#0369a1', margin: '0 0 4px' }}>
                  Créditos contabilizados:{' '}
                  <strong>{contabilizados.nc}</strong>
                  <span style={{ color: '#64748b' }}> (máx. {MAX_NC_POR_ESTUDIANTE} NC por alumno)</span>
                  {' '}— Semestres estimados restantes: <strong>{semestresEst}</strong> (aprox. {ncPorSemestre} NC/semestre)
                </p>
              );
            })()}
          </>
        )}
      </div>

      {/* ── SECCIÓN 5 — Aceptar Trámite y Generar PDF ────────────────────────── */}
      <div style={{ ...sectionCard, border: '2px solid #1e3a5f' }}>
        <h2 style={sectionTitle}>
          <span style={badge}>5</span>
          Generar Solicitud de Igualdad Académica
        </h2>

        <p style={{ fontSize: 13, color: '#374151', margin: '0 0 16px' }}>
          Genera el documento oficial con la hoja membretada del CUCEI. El PDF se descargará
          automáticamente con el número de folio correlativo.
        </p>

        {pdfError && (
          <p style={{ color: 'crimson', background: '#fee2e2', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
            {pdfError}
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleGenerarPdf}
            disabled={!kardex || generatingPdf}
            style={{
              padding: '12px 24px',
              background: kardex ? '#1e3a5f' : '#9ca3af',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: kardex ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background .15s',
            }}
          >
            {generatingPdf ? '⏳ Generando PDF…' : '📄 Generar Solicitud de Igualdad Académica'}
          </button>

          {!kardex && (
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              Sube un kardex en la Sección 1 para habilitar este botón.
            </span>
          )}
        </div>

        {kardex && (
          <div style={{ marginTop: 14, fontSize: 12, color: '#6b7280' }}>
            El PDF incluirá: folio <strong>{leerFolio() + 1}</strong> ·{' '}
            <strong>{totalEquivalentes}</strong> equivalencias ·{' '}
            alumno <strong>{kardex.estudiante.nombre}</strong> ({kardex.estudiante.codigo})
          </div>
        )}
      </div>
    </main>
  );
}

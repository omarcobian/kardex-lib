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
};

type EquivalenciaEspecial = {
  origen: { clave: string; nombre: string; creditos: number }[];
  destino: Destino;
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

type EstadoRow = 'verde' | 'amarillo' | 'rojo' | 'gris';

type TablaRow = {
  estado: EstadoRow;
  inbi: { clave: string; nombre: string; creditos: number; calificacion: number | null; nc: number | null } | null;
  lib: { clave: string; nombre: string; creditos: number } | null;
};

type ConteoStorage = {
  codigo_alumno: string;
  total: number;
  materias: string[];
  timestamp: string;
};

// ─── Color helpers ─────────────────────────────────────────────────────────────

const COLOR: Record<EstadoRow, string> = {
  verde: '#d1fae5',
  amarillo: '#fef9c3',
  rojo: '#fee2e2',
  gris: '#f3f4f6',
};

const COLOR_BORDER: Record<EstadoRow, string> = {
  verde: '#6ee7b7',
  amarillo: '#fde68a',
  rojo: '#fca5a5',
  gris: '#e5e7eb',
};

// ─── Equivalency logic ─────────────────────────────────────────────────────────

function calcularFilas(kardex: Kardex | null, planData: PlanData): TablaRow[] {
  const rows: TablaRow[] = [];
  const { equivalencias: eqData } = planData;

  // Build lookup map: kardex materias by clave
  const kardexMap = new Map<string, Kardex['materias'][0]>();
  if (kardex) {
    for (const m of kardex.materias) kardexMap.set(m.clave, m);
  }

  // Track which LIB claves get covered by an equivalencia
  const libCubiertasClaves = new Set<string>();

  // Origen claves ya resueltos por una equivalencia especial (no deben
  // evaluarse de nuevo en el recorrido de "sin equivalencia").
  const origenCubiertosPorEspecial = new Set<string>();

  // Equivalencias especiales: requieren VARIOS orígenes (p.ej. dos seminarios)
  // para convalidar un solo destino. Se evalúan primero.
  for (const esp of eqData.equivalencias_especiales ?? []) {
    const kms = esp.origen.map(o => kardexMap.get(o.clave));
    if (kms.every((km): km is NonNullable<typeof km> => km != null)) {
      rows.push({
        estado: 'verde',
        inbi: {
          clave: esp.origen.map(o => o.clave).join(' + '),
          nombre: esp.origen.map(o => o.nombre).join(' + '),
          creditos: esp.origen.reduce((sum, o) => sum + o.creditos, 0),
          calificacion: null,
          nc: null,
        },
        lib: { clave: esp.destino.clave, nombre: esp.destino.nombre, creditos: esp.destino.creditos },
      });
      libCubiertasClaves.add(esp.destino.clave);
      for (const o of esp.origen) origenCubiertosPorEspecial.add(o.clave);
    }
  }

  // Process each equivalencia pair
  for (const eq of eqData.equivalencias) {
    // _clave_ssp overrides the lookup clave when the INBI seminario has a separate code
    const lookupClave = eq.origen._clave_ssp ?? eq.origen.clave;
    const km = kardexMap.get(lookupClave);

    if (km) {
      // Un origen puede convalidar uno o varios destinos (p.ej. los proyectos INBI).
      const destinos = Array.isArray(eq.destino) ? eq.destino : [eq.destino];
      for (const destino of destinos) {
        // Credits differ → partial equivalence (amarillo); equal → direct (verde)
        const estado: EstadoRow = eq.origen.creditos !== destino.creditos ? 'amarillo' : 'verde';
        rows.push({
          estado,
          inbi: { clave: km.clave, nombre: km.nombre, creditos: eq.origen.creditos, calificacion: km.calificacion, nc: km.nc },
          lib: { clave: destino.clave, nombre: destino.nombre, creditos: destino.creditos },
        });
        libCubiertasClaves.add(destino.clave);
      }
    }
  }

  // Kardex materias explicitly listed as sin equivalencia
  if (kardex) {
    for (const sinEq of eqData.sin_equivalencia) {
      const km = kardexMap.get(sinEq.clave);
      if (km) {
        rows.push({
          estado: 'rojo',
          inbi: { clave: km.clave, nombre: km.nombre, creditos: sinEq.creditos, calificacion: km.calificacion, nc: km.nc },
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
      if (origenCubiertosPorEspecial.has(km.clave)) continue;
      if (!todasOriginClaves.has(km.clave)) {
        rows.push({
          estado: 'rojo',
          inbi: { clave: km.clave, nombre: km.nombre, creditos: km.nc ?? 0, calificacion: km.calificacion, nc: km.nc },
          lib: null,
        });
      }
    }
  }

  // LIB materias not covered by any matched equivalencia → gris (pending)
  for (const libM of planData.planLib.materias) {
    if (!libCubiertasClaves.has(libM.clave)) {
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

// ─── LocalStorage helpers ──────────────────────────────────────────────────────

function guardarConteo(conteo: ConteoStorage) {
  localStorage.setItem('cambio_plan_conteo_pendientes', JSON.stringify(conteo));
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
  // Load the official letterhead PDF
  const res = await fetch('/api/hoja-membretada');
  if (!res.ok) throw new Error('No se pudo cargar la hoja membretada.');
  const hojaBytes = await res.arrayBuffer();

  const doc = await PDFDocument.load(hojaBytes, { ignoreEncryption: true });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.getPage(0);
  const { width: W, height: H } = page.getSize();

  const LEFT = 70;
  const RIGHT = W - 65;
  const CONTENT_W = RIGHT - LEFT;
  let y = H - 135; // Start below the letterhead area

  const draw = (text: string, x: number, yPos: number, size = 9, bold = false) => {
    page.drawText(text, {
      x,
      y: yPos,
      size,
      font: bold ? helveticaBold : helvetica,
      color: rgb(0, 0, 0),
    });
  };

  const folioStr = `CUCEI/SAC/INBI/${folio}/2026`;
  const fechaStr = fechaEspanol();

  // Folio — top right
  draw(folioStr, RIGHT - helveticaBold.widthOfTextAtSize(folioStr, 9), y, 9, true);
  y -= 12;
  draw(`Guadalajara, Jal., ${fechaStr}`, RIGHT - helvetica.widthOfTextAtSize(`Guadalajara, Jal., ${fechaStr}`, 9), y, 9);
  y -= 22;

  // Recipient
  draw('Ing. Edson Aldair Vital Díaz', LEFT, y, 9, true);
  y -= 12;
  draw('Coordinador de Control Escolar', LEFT, y, 9);
  y -= 12;
  draw('Centro de Ciencias Exactas e Ingenierías - Universidad de Guadalajara', LEFT, y, 9);
  y -= 12;
  draw('P R E S E N T E:', LEFT, y, 9, true);
  y -= 20;

  // Body paragraph
  const cuerpo1 = `Solicito su apoyo para realizar la igualdad académica para el estudiante de`;
  const cuerpo2 = `Ingeniería Biomédica: ${kardex.estudiante.nombre ?? ''}, con código: ${kardex.estudiante.codigo ?? ''},`;
  const cuerpo3 = `de las siguientes asignaturas:`;
  for (const linea of [cuerpo1, cuerpo2, cuerpo3]) {
    draw(linea, LEFT, y, 9);
    y -= 13;
  }
  y -= 6;

  // Table — only matched equivalencias (verde/amarillo rows)
  const equivFilas = filas.filter(f => f.estado === 'verde' || f.estado === 'amarillo');

  // Column layout
  const COL_ASIG_W = Math.floor(CONTENT_W * 0.28);
  const COL_CLAVE_W = 48;
  const COL_CALIF_W = 40;
  const COL_NC_W = 28;
  const SEP_W = 10;
  const COL_ASIG2_W = Math.floor(CONTENT_W * 0.25);
  const COL_CLAVE2_W = 48;

  const xA1 = LEFT;
  const xC1 = xA1 + COL_ASIG_W;
  const xK1 = xC1 + COL_CLAVE_W;
  const xN1 = xK1 + COL_CALIF_W;
  const xSep = xN1 + COL_NC_W + 4;
  const xA2 = xSep + SEP_W;
  const xC2 = xA2 + COL_ASIG2_W;
  const xK2 = xC2 + COL_CLAVE2_W;

  const ROW_H = 11;

  // Panel headers
  page.drawLine({ start: { x: LEFT, y: y + 10 }, end: { x: RIGHT, y: y + 10 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  draw('INBI — Programa Origen', LEFT, y, 8, true);
  draw('LIB — Programa Destino', xA2, y, 8, true);
  y -= ROW_H;

  page.drawLine({ start: { x: LEFT, y: y + 10 }, end: { x: RIGHT, y: y + 10 }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
  draw('Asignatura', xA1, y, 7, true);
  draw('Clave', xC1, y, 7, true);
  draw('Calif.', xK1, y, 7, true);
  draw('NC', xN1, y, 7, true);
  draw('Asignatura', xA2, y, 7, true);
  draw('Clave', xC2, y, 7, true);
  draw('NC', xK2, y, 7, true);
  y -= ROW_H;

  page.drawLine({ start: { x: LEFT, y: y + 10 }, end: { x: RIGHT, y: y + 10 }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });

  // Helper to truncate text so it fits in a column
  const truncate = (text: string, maxW: number, size: number, font: typeof helvetica) => {
    let t = text;
    while (t.length > 0 && font.widthOfTextAtSize(t, size) > maxW - 4) t = t.slice(0, -1);
    return t === text ? t : t + '…';
  };

  for (const row of equivFilas) {
    const inbiNombre = truncate(row.inbi?.nombre ?? '', COL_ASIG_W, 7, helvetica);
    const libNombre = truncate(row.lib?.nombre ?? '', COL_ASIG2_W, 7, helvetica);

    draw(inbiNombre, xA1, y, 7);
    draw(row.inbi?.clave ?? '', xC1, y, 7);
    draw(row.inbi?.calificacion != null ? String(row.inbi.calificacion) : '', xK1, y, 7);
    draw(row.inbi?.nc != null ? String(row.inbi.nc) : '', xN1, y, 7);
    draw(libNombre, xA2, y, 7);
    draw(row.lib?.clave ?? '', xC2, y, 7);
    draw(row.lib?.creditos != null ? String(row.lib.creditos) : '', xK2, y, 7);

    y -= ROW_H;
    page.drawLine({ start: { x: LEFT, y: y + 9 }, end: { x: RIGHT, y: y + 9 }, thickness: 0.2, color: rgb(0.85, 0.85, 0.85) });
  }

  page.drawLine({ start: { x: LEFT, y: y + 9 }, end: { x: RIGHT, y: y + 9 }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
  y -= 18;

  // Closing paragraph
  const cierre = [
    'Las cuales están registradas en el kárdex de sus estudios previos en:',
    'Ingeniería Biomédica (INBI). Se anexa copia del kárdex del estudiante.',
    '',
    'Sin más por el momento agradezco su apoyo, y quedo atento para cualquier aclaración.',
  ];
  for (const linea of cierre) {
    if (linea) draw(linea, LEFT, y, 9);
    y -= 13;
  }
  y -= 10;

  // Signature block
  const pie = [
    'Atentamente',
    'Piensa y Trabaja',
    '"40 años de la Feria Internacional del Libro de Guadalajara"',
    `Guadalajara, Jal., ${fechaStr}`,
  ];
  for (const linea of pie) {
    draw(linea, LEFT, y, 9, linea === 'Atentamente' || linea === 'Piensa y Trabaja');
    y -= 13;
  }

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

  useEffect(() => {
    fetch('/api/leer-datos-plan')
      .then(r => r.json())
      .then((data: PlanData) => setPlanData(data))
      .catch(err => setPlanError((err as Error).message));

    setConteoPrevio(leerConteo());
  }, []);

  // Computed equivalency table rows
  const filas: TablaRow[] = planData ? calcularFilas(kardex, planData) : [];

  const pendientes = planData && kardex ? calcularPendientes(filas, planData) : [];

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
    const pendientesList = calcularPendientes(filas, planData);
    const conteo: ConteoStorage = {
      codigo_alumno: kardex.estudiante.codigo ?? '',
      total: pendientesList.length,
      materias: pendientesList,
      timestamp: new Date().toISOString(),
    };
    guardarConteo(conteo);
    setConteoPrevio(conteo);
  }, [kardex, planData, filas]);

  // ── PDF ───────────────────────────────────────────────────────────────────────

  const handleGenerarPdf = useCallback(async () => {
    if (!kardex || !planData) return;
    setGeneratingPdf(true);
    setPdfError(null);
    try {
      const folio = leerFolio() + 1;
      const pdfBytes = await generarPdfSolicitud(kardex, filas, folio);
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
  }, [kardex, planData, filas]);

  // ── Derived stats ─────────────────────────────────────────────────────────────

  const totalLib = planData?.planLib.materias.length ?? 0;
  const totalEquivalentes = filas.filter(f => f.estado === 'verde' || f.estado === 'amarillo').length;
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

        {!planData ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>Cargando datos del plan…</p>
        ) : (
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
                {filas.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: 'center', padding: 20 }}>
                      Sube un kardex para ver las equivalencias
                    </td>
                  </tr>
                ) : (
                  filas.map((row, i) => (
                    <tr key={i} style={{ background: COLOR[row.estado], borderBottom: `1px solid ${COLOR_BORDER[row.estado]}` }}>
                      <td style={{ ...td, maxWidth: 220 }}>{row.inbi?.nombre ?? '—'}</td>
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
        )}
      </div>

      {/* ── SECCIÓN 3 — Materias Pendientes ──────────────────────────────────── */}
      <div style={sectionCard}>
        <h2 style={sectionTitle}>
          <span style={badge}>3</span>
          Materias Pendientes por Cursar
        </h2>

        {conteoPrevio && (
          <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#854d0e' }}>
            Conteo guardado anteriormente para el código <strong>{conteoPrevio.codigo_alumno}</strong>:{' '}
            <strong>{conteoPrevio.total} materias pendientes</strong> —{' '}
            {new Date(conteoPrevio.timestamp).toLocaleString('es-MX')}
          </div>
        )}

        {!kardex ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>Sube un kardex para calcular las materias pendientes.</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{
                background: pendientes.length === 0 ? '#d1fae5' : '#fee2e2',
                border: `1px solid ${pendientes.length === 0 ? '#6ee7b7' : '#fca5a5'}`,
                borderRadius: 8,
                padding: '10px 18px',
                fontWeight: 700,
                fontSize: 18,
                color: pendientes.length === 0 ? '#065f46' : '#991b1b',
              }}>
                {pendientes.length} materias pendientes por cursar
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
                {pendientes.map((m, i) => (
                  <div key={i} style={{
                    fontSize: 12,
                    padding: '4px 0',
                    borderBottom: '1px solid #f3f4f6',
                    breakInside: 'avoid',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                  }}>
                    <span style={{ color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>•</span>
                    {m}
                  </div>
                ))}
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

            {/* Semestres estimados */}
            {(() => {
              const ncPendiente = filas
                .filter(f => f.estado === 'gris' && f.lib)
                .reduce((sum, f) => sum + (f.lib?.creditos ?? 0), 0);
              const ncPorSemestre = 48; // approx NC per semester
              const semestresEst = ncPendiente > 0 ? Math.ceil(ncPendiente / ncPorSemestre) : 0;
              return (
                <p style={{ fontSize: 12, color: '#0369a1', margin: '0 0 4px' }}>
                  Créditos pendientes en LIB: <strong>{ncPendiente}</strong> — Semestres estimados restantes: <strong>{semestresEst}</strong> (aprox. {ncPorSemestre} NC/semestre)
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

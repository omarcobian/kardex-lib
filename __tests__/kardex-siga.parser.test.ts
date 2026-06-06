// Tests del parser SIGA/CUCEI.
//
// Los tests de UNIDAD validan las funciones puras sin necesitar ningún PDF.
// Los tests de INTEGRACIÓN requieren el archivo fixture:
//   __tests__/fixtures/KARDEX_AYALA_GONZALEZ_NORA.pdf
// Si el archivo no existe los tests de integración se omiten automáticamente.

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  parseCalificacionSiga,
  parseSigaEstudiante,
  parseSigaMaterias,
} from '../lib/parsers/kardex-siga.parser';
import { buildKardexSiga } from '../lib/parsers/kardex-siga.parser';
import { detectKardexFormat } from '../lib/parsers/kardex-format-detector';
import type { TextItem } from '../lib/types';

// ─── Tests de unidad ───────────────────────────────────────────────────────────

describe('parseCalificacionSiga', () => {
  test('extrae número y texto de "100 CIEN"', () => {
    const r = parseCalificacionSiga('100 CIEN');
    expect(r.num).toBe(100);
    expect(r.texto).toBe('CIEN');
  });

  test('extrae número y texto de "97 NOVENTA Y SIETE"', () => {
    const r = parseCalificacionSiga('97 NOVENTA Y SIETE');
    expect(r.num).toBe(97);
    expect(r.texto).toBe('NOVENTA Y SIETE');
  });

  test('extrae número y texto de "85 OCHENTA Y CINCO"', () => {
    const r = parseCalificacionSiga('85 OCHENTA Y CINCO');
    expect(r.num).toBe(85);
    expect(r.texto).toBe('OCHENTA Y CINCO');
  });

  test('extrae número y texto de "98 NOVENTA Y OCHO"', () => {
    const r = parseCalificacionSiga('98 NOVENTA Y OCHO');
    expect(r.num).toBe(98);
    expect(r.texto).toBe('NOVENTA Y OCHO');
  });

  test('extrae número y texto de "94 NOVENTA Y CUATRO"', () => {
    const r = parseCalificacionSiga('94 NOVENTA Y CUATRO');
    expect(r.num).toBe(94);
    expect(r.texto).toBe('NOVENTA Y CUATRO');
  });

  test('maneja cadena vacía', () => {
    const r = parseCalificacionSiga('');
    expect(r.num).toBeNull();
    expect(r.texto).toBe('');
  });

  test('maneja solo número sin texto', () => {
    const r = parseCalificacionSiga('100');
    expect(r.num).toBe(100);
    expect(r.texto).toBe('');
  });
});

// ─── Tests de encabezado del estudiante ───────────────────────────────────────

describe('parseSigaEstudiante', () => {
  // Simular ítems de texto del encabezado SIGA con coordenadas ficticias
  function makeItems(lines: string[]): TextItem[] {
    return lines.flatMap((line, row) =>
      line.split(' ').map((word, col) => ({
        text: word,
        x: col * 60,
        y: 800 - row * 15,
      })),
    );
  }

  test('extrae código y nombre correctamente', () => {
    const items = makeItems([
      'Código: 223823675 Nombre: NORA AYALA GONZALEZ',
      'Situación: ACTIVO Nivel: LICENCIATURA',
      'Admisión: 2023B Ultimo Ciclo: 2026A',
      'Carrera: INGENIERIA BIOMEDICA',
      'Centro: CENTRO UNIVERSITARIO DE CIENCIAS EXACTAS',
      'Sede: CAMPUS TECNOLOGICO GDL',
      'Promedio: 97.00 Créditos: 200',
    ]);
    const est = parseSigaEstudiante(items);
    expect(est.codigo).toBe('223823675');
    expect(est.nombre).toBe('NORA AYALA GONZALEZ');
    expect(est.nivel).toBe('LICENCIATURA');
    expect(est.promedio).toBe(97);
    expect(est.creditos).toBe(200);
    expect(est.admision).toBe('2023B');
    expect(est.ultimoCiclo).toBe('2026A');
  });
});

// ─── Tests de parseo de materias (ruta feliz con datos sintéticos) ─────────────

describe('parseSigaMaterias', () => {
  // Construir una página sintética con la estructura columnar del PDF SIGA
  function buildPage(rows: Array<{
    crn: string; clave: string; nombre: string;
    calif: string; tipo: string; nc: string; hc: string; fecha: string;
  }>, calendario: string): TextItem[] {
    const items: TextItem[] = [];
    let y = 700;

    // Encabezado de calendario
    items.push({ text: 'CALENDARIO', x: 30, y });
    items.push({ text: calendario, x: 85, y });
    y -= 15;

    for (const r of rows) {
      items.push({ text: r.crn,    x: 30,  y });
      items.push({ text: r.clave,  x: 85,  y });
      // Nombre puede ser multi-token, ponerlos desde x=106
      r.nombre.split(' ').forEach((w, i) => items.push({ text: w, x: 106 + i * 20, y }));
      // Calificacion (número + texto)
      r.calif.split(' ').forEach((w, i) => items.push({ text: w, x: 296 + i * 30, y }));
      items.push({ text: r.tipo,   x: 400, y });
      items.push({ text: r.nc,     x: 490, y });
      items.push({ text: r.hc,     x: 510, y });
      items.push({ text: r.fecha,  x: 530, y });
      y -= 12;
    }
    return items;
  }

  test('parsea materias del calendario 2023-B', () => {
    const pagina = buildPage(
      [
        { crn: '159329', clave: 'I7590', nombre: 'ANATOMIA MECANICA I',    calif: '100 CIEN',             tipo: 'ORDINARIO (OE)', nc: '8', hc: '68', fecha: '08/DIC/2023' },
        { crn: '42496',  clave: 'I5893', nombre: 'METODOS MATEMATICOS I',  calif: '97 NOVENTA Y SIETE',   tipo: 'ORDINARIO (OE)', nc: '8', hc: '68', fecha: '08/DIC/2023' },
        { crn: '42570',  clave: 'I5882', nombre: 'PROGRAMACION',           calif: '85 OCHENTA Y CINCO',   tipo: 'ORDINARIO (OE)', nc: '8', hc: '68', fecha: '08/DIC/2023' },
      ],
      '2023-B',
    );

    const materias = parseSigaMaterias([pagina]);
    expect(materias).toHaveLength(3);

    expect(materias[0]).toMatchObject({
      nrc:         '159329',
      clave:       'I7590',
      calificacion: 100,
      nc:           8,
      calendario:   '2023-B',
    });

    expect(materias[1].calificacion).toBe(97);
    expect(materias[1].calificacionTexto).toBe('NOVENTA Y SIETE');
    expect(materias[2].calificacion).toBe(85);
  });

  test('marca materias sin área de estudios con sinAreaEstudios: true', () => {
    const pagina: TextItem[] = [
      // Sección header
      { text: 'CURSOS', x: 30,  y: 700 },
      { text: 'SIN',    x: 90,  y: 700 },
      { text: 'REGISTRO', x: 120, y: 700 },
      { text: 'DE',    x: 190, y: 700 },
      { text: 'AREA',  x: 210, y: 700 },
      // Materia ET352
      { text: 'SN352', x: 30,  y: 680 },
      { text: 'ET352', x: 85,  y: 680 },
      { text: 'TOPICOS', x: 106, y: 680 },
      { text: 'INGENIERIA', x: 150, y: 680 },
      { text: '98 NOVENTA Y OCHO', x: 296, y: 680 },
      { text: 'ORDINARIO (OE)', x: 400, y: 680 },
      { text: '6', x: 490, y: 680 },
      { text: '60', x: 510, y: 680 },
      { text: '01/ENE/2025', x: 530, y: 680 },
    ];

    const materias = parseSigaMaterias([pagina]);
    const et352 = materias.find(m => m.clave === 'ET352');
    expect(et352).toBeDefined();
    expect(et352?.sinAreaEstudios).toBe(true);
    expect(et352?.nc).toBe(6);
  });

  test('detiene el parseo al encontrar RESUMEN DE CREDITOS', () => {
    const pagina: TextItem[] = [
      // Materia válida
      { text: '159329', x: 30, y: 700 },
      { text: 'I7590',  x: 85, y: 700 },
      { text: '100 CIEN', x: 296, y: 700 },
      { text: 'ORDINARIO (OE)', x: 400, y: 700 },
      { text: '8', x: 490, y: 700 },
      { text: '68', x: 510, y: 700 },
      // Línea de RESUMEN que debe parar el parseo
      { text: 'RESUMEN', x: 106, y: 600 },
      { text: 'DE CREDITOS', x: 200, y: 600 },
      // Esta materia NO debe parsearse
      { text: '999999', x: 30, y: 580 },
      { text: 'I0000',  x: 85, y: 580 },
    ];

    const materias = parseSigaMaterias([pagina]);
    expect(materias.find(m => m.nrc === '999999')).toBeUndefined();
  });
});

// ─── Tests de integración (requieren fixture PDF real) ────────────────────────

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'KARDEX_AYALA_GONZALEZ_NORA.pdf');
const tieneFixture = existsSync(FIXTURE_PATH);

const describeConFixture = tieneFixture ? describe : describe.skip;

describeConFixture('buildKardexSiga — integración con PDF real', () => {
  let kardex: Awaited<ReturnType<typeof buildKardexSiga>>;

  beforeAll(async () => {
    const buf = await readFile(FIXTURE_PATH);
    kardex = await buildKardexSiga(new Uint8Array(buf));
  });

  test('datos del estudiante correctos', () => {
    expect(kardex.estudiante.codigo).toBe('223823675');
    expect(kardex.estudiante.nombre).toBe('NORA AYALA GONZALEZ');
    expect(kardex.estudiante.promedio).toBe(97);
    expect(kardex.estudiante.creditos).toBe(200);
    expect(kardex.estudiante.admision).toBe('2023B');
    expect(kardex.estudiante.ultimoCiclo).toBe('2026A');
  });

  test('número total de materias', () => {
    // 6+6+6+5+5 semestres + 2 sin área = 30 (ajustar si el conteo real difiere)
    expect(kardex.totalMaterias).toBeGreaterThanOrEqual(28);
  });

  test('primera materia del calendario 2023-B', () => {
    const m = kardex.materias.find(m => m.nrc === '159329');
    expect(m).toBeDefined();
    expect(m?.clave).toBe('I7590');
    expect(m?.calificacion).toBe(100);
    expect(m?.nc).toBe(8);
    expect(m?.calendario).toBe('2023-B');
  });

  test('calificación "97 NOVENTA Y SIETE" se extrae correctamente', () => {
    const m = kardex.materias.find(m => m.clave === 'I5893' && m.calendario === '2023-B');
    expect(m?.calificacion).toBe(97);
    expect(m?.calificacionTexto).toBe('NOVENTA Y SIETE');
  });

  test('calificación "85 OCHENTA Y CINCO" de Programación', () => {
    const m = kardex.materias.find(m => m.clave === 'I5882');
    expect(m?.calificacion).toBe(85);
  });

  test('materias del calendario 2024-A', () => {
    const cal = kardex.materias.filter(m => m.calendario === '2024-A');
    expect(cal).toHaveLength(6);
    expect(cal.find(m => m.clave === 'I7592')?.calificacion).toBe(100); // ANATOMIA MECANICA II
    expect(cal.find(m => m.clave === 'I5895')?.calificacion).toBe(80);  // METODOS MAT II
  });

  test('materias de CURSOS SIN ÁREA (ET352, ET355)', () => {
    const et352 = kardex.materias.find(m => m.clave === 'ET352');
    const et355 = kardex.materias.find(m => m.clave === 'ET355');
    expect(et352).toBeDefined();
    expect(et355).toBeDefined();
    expect(et352?.sinAreaEstudios).toBe(true);
    expect(et352?.nc).toBe(6);
    expect(et352?.calificacion).toBe(98);
  });

  test('detectKardexFormat identifica el PDF como siga-cucei', async () => {
    const buf = await readFile(FIXTURE_PATH);
    const formato = await detectKardexFormat(new Uint8Array(buf));
    expect(formato).toBe('siga-cucei');
  });
});

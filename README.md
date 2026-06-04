This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.


Claude terminó la respuesta
Kárdex.pdf
pdf

quiero que geenres una api en next js para que obstraiga las clases , la calificacion , el codigo , y el nrc  y aparte el ocdigo del estudiante  y el nombre la carrera

6:53 PM

Analizando posiciones de columnas en la estructura PDF
Analizando posiciones de columnas en la estructura PDF
Voy a revisar la estructura interna del PDF para escribir un parser que de verdad funcione con este formato de Kardex. Primero leo la guía de lectura de PDFs.


Analizó estructura PDF para extraer datos posicionalmente
Analizó estructura PDF para extraer datos posicionalmente
Ahora inspecciono el PDF para entender las posiciones exactas de las columnas. Esto me permite escribir un parser confiable.


Mapeando coordenadas de columnas para extraer datos estudiantiles
Mapeando coordenadas de columnas para extraer datos estudiantiles
It's an Oracle Reports PDF with a clean text layer. Let me extract word positions to map the table columns.


Refinando validación de códigos NRC especiales
Refinando validación de códigos NRC especiales
I now have the exact column geometry for page 1. Let me confirm page 2 follows the same layout and inspect the credits summary.


Depurando último curso que se desbordan en sección de créditos
Depurando último curso que se desbordan en sección de créditos
Both pages share the same column geometry. I have everything I need. Let me validate the full parsing algorithm in Python first (equivalent to what the Node parser will do), to be sure the logic is correct before writing the TypeScript:


Debugeó parser de datos académicos e implementó validación robusta
Debugeó parser de datos académicos e implementó validación robusta
45 of 46 courses parse perfectly — including the tricky multi-attempt case (CIRCUITOS with ordinario 40 + extraordinario 90). The only bug: the last course bleeds into the credits-summary section because nothing stops it. Let me add a terminator and also capture the credits summary as a bonus, then verify:


Architected complete Next.js API para extraer datos académicos del Kardex
Architected complete Next.js API para extraer datos académicos del Kardex
Parsing is fully validated against the real document — 46/46 courses, the multi-attempt retake handled, header and credits summary exact. Now I'll generate the ground-truth sample output and build the Next.js project.


Estructuró arquitectura de proyecto Next.js para API de estudiantes
Estructuró arquitectura de proyecto Next.js para API de estudiantes
Now I'll build the complete Next.js project.


Estructuró archivos de configuración para API Next.js
Estructuró archivos de configuración para API Next.js
Now the project config and a small browser test page.


Preparó archivos faltantes para completar estructura del proyecto
Preparó archivos faltantes para completar estructura del proyecto
All core files are intact. Let me add the remaining files: next-env.d.ts, .gitignore, and the Spanish README.md.


Estructuró documentación completa para API educativa en Next.js
Estructuró documentación completa para API educativa en Next.js
All files are complete. Let me present the project.


Presented 11 files
Presented 11 files
Listo. La API en Next.js 14 (App Router) está completa y calibrada con tu Kardex real.

Para correrla:

bash
npm install
npm run dev
Para probarla (con el servidor en marcha):

bash
curl -F "file=@Kárdex.pdf" http://localhost:3000/api/kardex
También hay una página de prueba en http://localhost:3000 para subir el PDF desde el navegador.

Qué extrae el endpoint POST /api/kardex: por cada materia te da la clase (nombre), la calificacion, la clave (código) y el nrc; y aparte los datos del estudiante (codigo, nombre, carrera, más nivel, centro, sede, situación, créditos y promedio).

Dos cosas que decidí en el camino y que conviene que sepas:

Materias con varios intentos. Como el PDF (Oracle Reports) entrega el texto por columnas y no por renglón, el parser reconstruye cada fila por coordenadas. Eso permite detectar materias recursadas: cada presentación queda en un arreglo intentos[], y los campos de calificación de arriba reflejan el último intento. Tu caso real CIRCUITOS ELECTRONICOS Y ELECTROMAGNETISMO (IL346) sale con dos intentos: ordinario 40 y extraordinario 90.
Resumen de créditos de regalo. Además de las 46 materias, se extrae el bloque de la página 2 (resumenCreditos): requeridos/adquiridos/faltantes, tipo de certificado y el desglose por área.
En examples/sample-response.json está la salida completa generada con tu PDF, por si quieres ver la forma exacta del JSON.

Una nota: las bandas de columnas están afinadas para el Kardex de SIIAU en tamaño carta. Si algún día un PDF trae un formato distinto y algo sale corrido, el único archivo a tocar es lib/parseKardex.ts.


Readme
Documento · MD 

Route
TS 

Parsekardex
TS 

Extractpdf
TS 

Types
TS 

Page
Código · TSX 

Layout
Código · TSX 

Package
Código · JSON 

Next.config
MJS 

Tsconfig
Código · JSON 

Sample response
Código · JSON 






Claude es IA y puede cometer errores. Por favor, verifica nuevamente las respuestas.


raw
Readme · MD
# API Kardex UdeG (Next.js)
 
API en **Next.js 14 (App Router)** que recibe el PDF del **Kardex del Estudiante** de la Universidad de Guadalajara (SIIAU) y lo devuelve como JSON estructurado: datos del estudiante, lista de materias (clase, calificación, clave, NRC, etc.) y el resumen de créditos por área.
 
## Requisitos
 
- Node.js >= 18.18
- npm
## Instalación y arranque
 
```bash
npm install
npm run dev
```
 
El servidor queda en `http://localhost:3000`. Hay una página de prueba en `/` donde puedes subir el PDF y ver el resultado, además del endpoint de la API.
 
## Endpoint
 
### `POST /api/kardex`
 
Envía el PDF de cualquiera de estas dos formas:
 
1. **multipart/form-data** en el campo `file` (también acepta `archivo` o `pdf`).
2. El **binario del PDF** directo en el body con `Content-Type: application/pdf`.
Ejemplo con `curl` (multipart):
 
```bash
curl -F "file=@Kárdex.pdf" http://localhost:3000/api/kardex
```
 
Ejemplo con `curl` (body binario):
 
```bash
curl --data-binary @Kárdex.pdf \
  -H "Content-Type: application/pdf" \
  http://localhost:3000/api/kardex
```
 
### `GET /api/kardex`
 
Devuelve información de uso del endpoint.
 
## Forma de la respuesta
 
```jsonc
{
  "estudiante": {
    "codigo": "222966014",
    "nombre": "MARVIN ALONSO LUJAN MIRANDA",
    "carrera": "INGENIERIA EN COMPUTACION (ICOM)",
    "nivel": "LICENCIATURA",
    "centro": "...",
    "sede": "...",
    "situacion": "ACTIVO",
    "admision": "2022B",
    "ultimoCiclo": "2026A",
    "creditos": 360,
    "promedio": 88.07
  },
  "materias": [
    {
      "calendario": "2022-B",
      "nrc": "189611",
      "clave": "IL341",
      "nombre": "ETICA Y LEGISLACION",
      "calificacion": 90,
      "calificacionTexto": "90 (NOVENTA)",
      "tipo": "ORDINARIO (OE)",
      "nc": 8,
      "hc": 80,
      "fecha": "09/DIC/2022",
      "intentos": [
        {
          "calificacion": 90,
          "calificacionTexto": "90 (NOVENTA)",
          "tipo": "ORDINARIO (OE)",
          "nc": 8,
          "hc": 80,
          "fecha": "09/DIC/2022"
        }
      ]
    }
  ],
  "resumenCreditos": {
    "requeridosPrograma": 394,
    "adquiridosTotales": 360,
    "faltantesTotales": 34,
    "certificado": "PARCIAL",
    "porArea": [
      { "area": "BASICO PARTICULAR OBLIGATORIA", "requeridos": 101, "adquiridos": 93, "faltantes": 8 }
    ]
  },
  "totalMaterias": 46
}
```
 
En `examples/sample-response.json` está la respuesta completa generada con el PDF de ejemplo.
 
### Códigos de respuesta
 
- `200` — OK, regresa el Kardex.
- `400` — falta el archivo o viene vacío.
- `415` — `Content-Type` no soportado.
- `422` — el PDF no se reconoce como un Kardex de la UdeG.
- `500` — error al procesar el PDF.
## Notas de diseño
 
- **Materias con varios intentos.** Cada materia tiene un arreglo `intentos[]`. Si una materia se cursó más de una vez (p. ej. ordinario reprobado + extraordinario), cada presentación queda en `intentos[]`. Los campos de calificación del nivel superior reflejan el **último** intento. Ejemplo real: *CIRCUITOS ELECTRONICOS Y ELECTROMAGNETISMO* (clave IL346) trae dos intentos: ordinario 40 y extraordinario 90, y `calificacion` queda en 90.
- **Resumen de créditos.** Además de las materias, se extrae el resumen de la segunda página (`resumenCreditos`): créditos requeridos/adquiridos/faltantes y el desglose por área de estudios.
- **Parseo por posición.** El PDF (generado por Oracle Reports) entrega el texto agrupado por columnas y no por renglón, así que el parser reconstruye cada fila usando las coordenadas X/Y de cada palabra. Las bandas de columnas están **calibradas para el Kardex de SIIAU en tamaño carta**; un formato distinto podría requerir ajustar esos límites en `lib/parseKardex.ts`.
## Estructura del proyecto
 
```
app/
  api/kardex/route.ts   # endpoint POST/GET
  layout.tsx
  page.tsx              # UI mínima de prueba
lib/
  extractPdf.ts         # extrae palabras con posición (unpdf / pdf.js)
  parseKardex.ts        # parser por posición -> JSON
  types.ts              # tipos TypeScript
examples/
  sample-response.json  # salida de ejemplo
```
 
## Nota sobre Next.js 15
 
El proyecto está fijado a Next.js 14. En `next.config.mjs` se usa `experimental.serverComponentsExternalPackages`. Si actualizas a **Next.js 15**, esa opción se renombró a `serverExternalPackages` (nivel superior, sin `experimental`).
 


## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

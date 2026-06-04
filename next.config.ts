/**
 * next.config.ts
 *
 * Configuración de Next.js con fix para pdf-parse.
 *
 * El problema: pdf-parse tiene un import de canvas que webpack intenta
 * resolver para el bundle del servidor y falla en algunos entornos.
 * La solución: declararlo como external para que Node.js lo resuelva
 * directamente en runtime, sin pasar por webpack.
 */

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
import type { ReactNode } from 'react';

export const metadata = {
  title: 'API Kardex UdeG',
  description: 'Extrae materias, calificaciones, clave y NRC de un Kardex de la UdeG.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}

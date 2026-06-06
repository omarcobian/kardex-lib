import type { ReactNode } from 'react';
import NavBar from '@/app/components/NavBar';
import '@/app/globals.css';

export const metadata = {
  title: 'SGA CUCEI — Sistema de Gestión Académica',
  description:
    'Herramientas digitales para trámites escolares del CUCEI, Universidad de Guadalajara.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          background: '#f1f5f9',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <NavBar />
        {children}
      </body>
    </html>
  );
}

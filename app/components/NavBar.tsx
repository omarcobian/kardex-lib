'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CSSProperties } from 'react';

const NAV_ITEMS = [
  { href: '/kardex',      label: 'Extractor de Kardex' },
  { href: '/cambio-plan', label: 'Igualdad Académica' },
];

export default function NavBar() {
  const pathname = usePathname();

  const linkStyle = (href: string): CSSProperties => ({
    color: pathname === href ? '#fff' : '#94a3b8',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: pathname === href ? 600 : 400,
    padding: '0 16px',
    height: 52,
    display: 'flex',
    alignItems: 'center',
    borderBottom: pathname === href ? '2px solid #38bdf8' : '2px solid transparent',
    transition: 'color .15s, border-color .15s',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <nav
      style={{
        background: '#1e3a5f',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        height: 52,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,.25)',
      }}
    >
      <Link
        href="/"
        style={{
          color: '#fff',
          fontWeight: 800,
          fontSize: 15,
          textDecoration: 'none',
          marginRight: 8,
          letterSpacing: 0.3,
          flexShrink: 0,
        }}
      >
        SGA CUCEI
      </Link>

      <span style={{ color: '#334d6e', marginRight: 8, fontSize: 18, userSelect: 'none' }}>|</span>

      <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href} style={linkStyle(item.href)}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

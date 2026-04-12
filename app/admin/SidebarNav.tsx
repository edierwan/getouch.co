'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ADMIN_NAV } from './data';

export default function SidebarNav() {
  const pathname = usePathname();
  const [activeHash, setActiveHash] = useState('');

  useEffect(() => {
    const syncHash = () => setActiveHash(window.location.hash.replace('#', ''));
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const normalizeHref = (href: string) => href.split('#')[0];
  const extractHash = (href: string) => href.split('#')[1] ?? '';

  return (
    <nav className="portal-nav">
      {ADMIN_NAV.map((section) => (
        <div key={section.label} className="portal-nav-section">
          <div className="portal-nav-label">{section.label}</div>
          {section.items.map((item) => {
            const itemHash = extractHash(item.href);
            const isInfrastructureRoot = normalizeHref(item.href) === '/admin/infrastructure' && itemHash === '';
            const isActive =
              !item.external &&
              pathname === normalizeHref(item.href) &&
              (itemHash ? activeHash === itemHash : isInfrastructureRoot ? activeHash === '' : true);
            const className = `portal-nav-item${isActive ? ' portal-nav-item-active' : ''}`;

            if (item.external) {
              return (
                <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
                  <span className="portal-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  <span className="portal-nav-ext">↗</span>
                </a>
              );
            }

            /* When clicking a hash link on the same page (e.g. Infrastructure →
               Servers & Nodes), Next.js Link won't trigger a native hashchange
               because the pathname is identical.  Force the hash update so
               InfrastructureClient's hashchange listener picks it up. */
            const handleClick = (e: React.MouseEvent) => {
              if (itemHash && pathname === normalizeHref(item.href)) {
                e.preventDefault();
                window.location.hash = itemHash;
              }
              setActiveHash(itemHash);
            };

            return (
              <Link
                key={item.href}
                href={item.href}
                className={className}
                aria-current={isActive ? 'page' : undefined}
                onClick={handleClick}
              >
                <span className="portal-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

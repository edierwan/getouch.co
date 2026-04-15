'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ADMIN_NAV } from './data';

/* Convert an internal /admin/* path to a public portal path. */
function toPublicPath(href: string): string {
  const idx = href.indexOf('#');
  const path = idx >= 0 ? href.slice(0, idx) : href;
  const hash = idx >= 0 ? href.slice(idx) : '';
  const pub = path === '/admin' ? '/' : path.startsWith('/admin/') ? path.slice('/admin'.length) : path;
  return pub + hash;
}

export default function SidebarNav({ isPortal }: { isPortal: boolean }) {
  const pathname = usePathname();
  const [activeHash, setActiveHash] = useState('');

  useEffect(() => {
    const syncHash = () => setActiveHash(window.location.hash.replace('#', ''));
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const splitPath = (href: string) => href.split('#')[0];
  const splitHash = (href: string) => href.split('#')[1] ?? '';

  /* Resolve href: on portal host use public paths to avoid middleware redirects. */
  const resolveHref = (href: string) => (isPortal ? toPublicPath(href) : href);

  /* Check if pathname matches a nav item (handles both /admin/* and public paths). */
  const pathMatches = (href: string): boolean => {
    const internal = splitPath(href);
    const pub = splitPath(toPublicPath(href));
    return pathname === internal || pathname === pub;
  };

  return (
    <nav className="portal-nav">
      {ADMIN_NAV.map((section) => (
        <div key={section.label} className="portal-nav-section">
          <div className="portal-nav-label">{section.label}</div>
          {section.items.map((item) => {
            const href = resolveHref(item.href);
            const itemHash = splitHash(item.href);
            const onSamePage = pathMatches(item.href);
            const isInfraRoot =
              (splitPath(item.href) === '/admin/infrastructure' ||
                splitPath(item.href) === '/infrastructure') &&
              itemHash === '';
            const isActive =
              !item.external &&
              onSamePage &&
              (itemHash ? activeHash === itemHash : isInfraRoot ? activeHash === '' : true);
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

            /* For hash links on the same page, force the hash update so
               InfrastructureClient's hashchange listener picks it up. */
            const handleClick = (e: React.MouseEvent) => {
              if (itemHash && onSamePage) {
                e.preventDefault();
                window.location.hash = itemHash;
                document.getElementById(itemHash)?.scrollIntoView({ block: 'start' });
                return;
              }

              if (isPortal) {
                e.preventDefault();
                window.location.assign(href);
                return;
              }

              setActiveHash(itemHash);
            };

            if (isPortal) {
              return (
                <a
                  key={item.href}
                  href={href}
                  className={className}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={handleClick}
                >
                  <span className="portal-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </a>
              );
            }

            return (
              <Link
                key={item.href}
                href={href}
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

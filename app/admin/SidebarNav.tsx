'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_NAV } from './data';

export default function SidebarNav() {
  const pathname = usePathname();
  const normalizeHref = (href: string) => href.split('#')[0];

  return (
    <nav className="portal-nav">
      {ADMIN_NAV.map((section) => (
        <div key={section.label} className="portal-nav-section">
          <div className="portal-nav-label">{section.label}</div>
          {section.items.map((item) => {
            const isActive = !item.external && pathname === normalizeHref(item.href);
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

            return (
              <Link key={item.href} href={item.href} className={className}>
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

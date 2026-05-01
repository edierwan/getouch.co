'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ADMIN_NAV } from './data';

const SIDEBAR_SCROLL_STORAGE_KEY = 'getouch.admin.sidebar.scrollTop';
const SIDEBAR_EXPANDED_SECTIONS_KEY = 'getouch.admin.sidebar.expandedSections.v3';

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
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const syncHash = () => setActiveHash(window.location.hash.replace('#', ''));
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      return;
    }

    const restoreScroll = () => {
      const savedScrollTop = window.sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY);
      if (!savedScrollTop) {
        return;
      }

      const parsedScrollTop = Number(savedScrollTop);
      if (Number.isFinite(parsedScrollTop)) {
        nav.scrollTop = parsedScrollTop;
      }
    };

    const saveScroll = () => {
      window.sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(nav.scrollTop));
    };

    restoreScroll();
    nav.addEventListener('scroll', saveScroll, { passive: true });
    window.addEventListener('pagehide', saveScroll);

    return () => {
      nav.removeEventListener('scroll', saveScroll);
      window.removeEventListener('pagehide', saveScroll);
      saveScroll();
    };
  }, [pathname]);

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

  const isItemActive = (href: string, external?: boolean) => {
    if (external) {
      return false;
    }

    const itemPath = splitPath(href);
    const itemHash = splitHash(href);
    const onSamePage = pathMatches(href);
    const isInfraRoot =
      (itemPath === '/admin/infrastructure' || itemPath === '/infrastructure') &&
      itemHash === '';
    const isDefaultInfrastructureItem = itemPath === '/admin/infrastructure' && itemHash === 'servers';

    return onSamePage && (itemHash
      ? activeHash === itemHash || (isDefaultInfrastructureItem && activeHash === '')
      : isInfraRoot
        ? activeHash === ''
        : true);
  };

  const activeSectionLabel =
    ADMIN_NAV.find((section) => section.items.some((item) => isItemActive(item.href, item.external)))?.label || null;

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_EXPANDED_SECTIONS_KEY);
    const parsed = stored ? (JSON.parse(stored) as unknown) : null;
    // First visit (no stored preference): expand every section so all nav
    // items are immediately discoverable. Returning visitors keep the
    // sections they explicitly collapsed/expanded.
    const next = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : ADMIN_NAV.map((section) => section.label);

    if (activeSectionLabel && !next.includes(activeSectionLabel)) {
      next.push(activeSectionLabel);
    }

    setExpandedSections(next);
  }, [activeSectionLabel]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_EXPANDED_SECTIONS_KEY, JSON.stringify(expandedSections));
  }, [expandedSections]);

  const toggleSection = (sectionLabel: string) => {
    setExpandedSections((current) =>
      current.includes(sectionLabel)
        ? current.filter((label) => label !== sectionLabel)
        : [...current, sectionLabel]
    );
  };

  return (
    <nav ref={navRef} className="portal-nav">
      {ADMIN_NAV.map((section) => (
        <div
          key={section.label}
          className={`portal-nav-section${activeSectionLabel === section.label ? ' portal-nav-section-active' : ''}`}
          style={{ '--portal-nav-accent': section.accentRgb ?? '126, 154, 255' } as CSSProperties}
        >
          <button
            type="button"
            className={`portal-nav-group-toggle${expandedSections.includes(section.label) ? ' portal-nav-group-toggle-expanded' : ''}${activeSectionLabel === section.label ? ' portal-nav-group-toggle-active' : ''}`}
            aria-expanded={expandedSections.includes(section.label)}
            aria-controls={`portal-nav-group-${section.label}`}
            onClick={() => toggleSection(section.label)}
          >
            <span className="portal-nav-label">{section.label}</span>
            <span className="portal-nav-chevron" aria-hidden="true">
              {expandedSections.includes(section.label) ? '⌄' : '›'}
            </span>
          </button>

          <div
            id={`portal-nav-group-${section.label}`}
            className={`portal-nav-submenu${expandedSections.includes(section.label) ? ' portal-nav-submenu-expanded' : ''}`}
          >
            {section.items.map((item) => {
              const href = resolveHref(item.href);
              const itemHash = splitHash(item.href);
              const onSamePage = pathMatches(item.href);
              const isActive = isItemActive(item.href, item.external);
              const className = `portal-nav-item${isActive ? ' portal-nav-item-active' : ''}${item.disabled ? ' portal-nav-item-disabled' : ''}`;

              if (item.disabled) {
                return (
                  <span key={item.label} className={className} aria-disabled="true">
                    <span className="portal-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    <span className="portal-nav-ext">Planned</span>
                  </span>
                );
              }

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
                if (navRef.current) {
                  window.sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(navRef.current.scrollTop));
                }

                if (!expandedSections.includes(section.label)) {
                  setExpandedSections((current) => [...current, section.label]);
                }

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
        </div>
      ))}
    </nav>
  );
}

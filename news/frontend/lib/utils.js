import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ms as msBM } from 'date-fns/locale';

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = parseISO(dateStr);
  return format(date, 'd MMM yyyy, HH:mm');
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = parseISO(dateStr);
  return formatDistanceToNow(date, { addSuffix: true });
}

export function getCategoryLabel(slug) {
  const map = {
    politics: 'Politik',
    business: 'Bisnes',
    technology: 'Teknologi',
    sports: 'Sukan',
    entertainment: 'Hiburan',
    world: 'Dunia',
    lifestyle: 'Gaya Hidup',
    health: 'Kesihatan',
    education: 'Pendidikan',
    crime: 'Jenayah',
    environment: 'Alam Sekitar',
    opinion: 'Pendapat',
  };
  return map[slug] || slug;
}

export function getCategoryColor(slug) {
  const map = {
    politics: '#dc2626',
    business: '#059669',
    technology: '#7c3aed',
    sports: '#d97706',
    entertainment: '#ec4899',
    world: '#2563eb',
    lifestyle: '#8b5cf6',
    health: '#10b981',
    education: '#6366f1',
    crime: '#991b1b',
    environment: '#16a34a',
    opinion: '#64748b',
  };
  return map[slug] || '#64748b';
}

export type StatusTone = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'orange' | 'gray';

export function getStatusTone(status: string | null | undefined, canceled?: boolean | null): StatusTone {
  if (canceled) return 'red';
  const s = status?.toLowerCase() ?? '';
  if (s.includes('diverted') || s.includes('diverting')) return 'orange';
  if (s.includes('cancel')) return 'red';
  if (
    s.includes('delayed') || s.startsWith('approx') || s.includes('new etd') ||
    s.includes('expected at') || s.includes('indefini') || s.includes('next info')
  ) return 'yellow';
  if (
    s.includes('landed') || s.includes('airborne') || s.includes('taxiing') ||
    s.includes('completed') || s.includes('holding') || s.includes('door and gate')
  ) return 'blue';
  if (
    s.includes('boarding') || s.includes('check in open') || s.includes('check-in open') ||
    s.includes('go to') || s.includes('final call') || s.includes('gate closed') ||
    s.includes('wait in lounge')
  ) return 'purple';
  if (s.includes('on time') || s === 'scheduled') return 'green';
  if (s.includes('pax') || s.includes('passengers')) return 'gray';
  return 'gray';
}

export const STATUS_TEXT_CLASSES: Record<StatusTone, string> = {
  orange: 'text-orange-600',
  red: 'text-red-600',
  yellow: 'text-yellow-600',
  blue: 'text-blue-600',
  purple: 'text-purple-600',
  green: 'text-green-600',
  gray: 'text-muted-foreground',
};

export const STATUS_DOT_CLASSES: Record<StatusTone, string> = {
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  green: 'bg-green-500',
  gray: 'bg-gray-400',
};

export const STATUS_BADGE_CLASSES: Record<StatusTone, string> = {
  orange: 'bg-orange-100 text-orange-800 border-orange-300',
  red: 'bg-red-100 text-red-800 border-red-300',
  yellow: 'bg-amber-100 text-amber-800 border-amber-300',
  blue: 'bg-blue-100 text-blue-800 border-blue-300',
  purple: 'bg-purple-100 text-purple-800 border-purple-300',
  green: 'bg-green-100 text-green-800 border-green-300',
  gray: 'bg-gray-100 text-gray-700 border-gray-300',
};

export const STATUS_PILL_CLASSES: Record<StatusTone, string> = {
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  green: 'bg-green-100 text-green-700',
  gray: 'bg-gray-100 text-gray-500',
};

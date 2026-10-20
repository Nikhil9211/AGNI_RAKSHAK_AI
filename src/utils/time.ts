export function formatIST(value: Date | string | number, options?: Intl.DateTimeFormatOptions) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    ...options,
  }).format(date);
}

export function formatISTDateTime(value: Date | string | number) {
  return formatIST(value, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }) + ' IST';
}

export function formatISTTime(value: Date | string | number) {
  return formatIST(value, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
}

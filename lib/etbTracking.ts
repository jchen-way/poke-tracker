export function ensureEtbDisplayName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/\betb\b/i.test(trimmed)) {
    return trimmed.replace(/\betb\b/i, 'Elite Trainer Box');
  }

  return /elite trainer box$/i.test(trimmed)
    ? trimmed
    : `${trimmed} Elite Trainer Box`;
}

export function inferEtbSetName(value: string) {
  return ensureEtbDisplayName(value).replace(/\s*elite trainer box$/i, '').trim();
}

export function buildEtbTrackedId({
  name,
  setName,
}: {
  name: string;
  setName?: string | null;
}) {
  const source = `${setName ?? inferEtbSetName(name)} ${ensureEtbDisplayName(name)}`.trim();
  return `etb:${slugify(source)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

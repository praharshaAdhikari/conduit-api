import { randomBytes } from 'node:crypto';

export const SLUG_MAX = 200;

/** "Hello, World!" -> "hello-world". A title with no letters or digits gives "article". */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '');
  return slug || 'article';
}

/** Appended to a slug that is already in use, so equal titles get distinct slugs. */
export function withSuffix(slug: string): string {
  return `${slug}-${randomBytes(4).toString('hex')}`;
}

// lib/images.ts
// جلب صورة معبّرة من ويكيبيديا (مجاني) لموضوع/عنوان — للعرض التقديمي.
const cache = new Map<string, string | null>();

/** يبحث في ويكيبيديا العربية ويُرجع رابط صورة مصغّرة للموضوع (أو null). */
export async function getWikipediaImage(query: string): Promise<string | null> {
  const q = (query || "").trim();
  if (!q) return null;
  if (cache.has(q)) return cache.get(q) ?? null;
  try {
    const url =
      "https://ar.wikipedia.org/w/api.php?action=query&format=json&redirects=1" +
      "&generator=search&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=700" +
      "&gsrsearch=" +
      encodeURIComponent(q);
    const res = await fetch(url, { headers: { "User-Agent": "VoiceStudyFlow/1.0" } });
    const data = await res.json();
    const pages = data?.query?.pages ?? {};
    let src: string | null = null;
    for (const k of Object.keys(pages)) {
      const t = pages[k]?.thumbnail?.source;
      if (t) {
        src = t as string;
        break;
      }
    }
    cache.set(q, src);
    return src;
  } catch {
    cache.set(q, null);
    return null;
  }
}

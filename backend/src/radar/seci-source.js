import {load} from 'cheerio';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {invalid} from './validation.js';
const exec = promisify(execFile);
export const DEFAULT_URL = 'https://www.seci.co.in/tenders';
export function seciUrl(value, base = DEFAULT_URL) {
  let url;
  try { url = new URL(value, base); } catch { invalid('Invalid SECI URL'); }
  if (url.protocol !== 'https:' || !['seci.co.in','www.seci.co.in'].includes(url.hostname) || url.port || url.username || url.password) invalid('Use an HTTPS URL on www.seci.co.in');
  if (!/^\/(tenders\/?$|tender-details\/[^/]+\/?$|uploads\/tenders\/)/.test(url.pathname)) invalid('Only SECI tender pages and tender documents are supported');
  url.hash = '';
  return url.href;
}
export async function fetchSeci(value, {fetchImpl = fetch, maxBytes = 25 * 1024 * 1024, signal} = {}) {
  let url = seciUrl(value);
  const timeout = AbortSignal.timeout(45000);
  const combined = signal ? AbortSignal.any([signal,timeout]) : timeout;
  for (let i = 0; i < 4; i++) {
    const response = await fetchImpl(url, {redirect:'manual', signal:combined, headers:{'User-Agent':'TenderDashboard/1.0 (SECI document review)'}});
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();
      url = seciUrl(response.headers.get('location'),url); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`SECI returned HTTP ${response.status}`); }
    if (Number(response.headers.get('content-length')) > maxBytes) {await response.body?.cancel(); throw new Error('Document exceeds size limit');}
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) { throw new Error('Document exceeds size limit'); }
      chunks.push(Buffer.from(chunk));
    }
    return {buffer:Buffer.concat(chunks), url};
  }
  throw new Error('Too many SECI redirects');
}
export function parseListing(html, base = DEFAULT_URL) {
  const $ = load(html), links = new Map();
  $('a[href]').each((_,a) => {
    const href = $(a).attr('href');
    try { const url = seciUrl(href,base); if (new URL(url).pathname.startsWith('/tender-details/')) links.set(url,{url,listing:$(a).closest('tr').text().replace(/\s+/g,' ').trim()}); } catch { /* Ignore unrelated links. */ }
  });
  if (!links.size) throw new Error('No tender links found. SECI may have changed its page layout.');
  return [...links.values()];
}
export function parseDetail(html, url) {
  const $ = load(html), documents = new Map();
  $('script,style,nav,header,footer').remove();
  $('a[href]').each((_,a) => {
    try {
      const link = seciUrl($(a).attr('href'),url);
      if (new URL(link).pathname.startsWith('/uploads/tenders/')) documents.set(link,{url:link,title:$(a).text().trim() || decodeURIComponent(new URL(link).pathname.split('/').at(-1)),context:$(a).closest('tr').text().replace(/\s+/g,' ').trim()});
    } catch { /* External portals remain manual sources. */ }
  });
  $('td,th,p,h1,h2,h3,br').append(' ');
  const text = $('body').text().replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
  const tenderId = text.match(/\bSECI\d{6}\b/)?.[0];
  if (!tenderId) throw new Error('Tender page has no SECI Tender ID');
  const labels={};
  $('td.fw-bold').each((_,cell)=>{labels[$(cell).text().replace(/\s+/g,' ').trim()]=$(cell).next('td').text().replace(/\s+/g,' ').trim();});
  const iso=(value,timestamp=false)=>{
    const m=value?.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}:\d{2}:\d{2}))?$/);
    return m?`${m[3]}-${m[2]}-${m[1]}${timestamp?`T${m[4]||'00:00:00'}+05:30`:''}`:null;
  };
  return {tenderId,text,documents:[...documents.values()],metadata:{title:labels['Tender Title']||null,ref_number:labels['Tender Reference No']||null,publication_date:iso(labels['Tender Publication Date']),closing_date:iso(labels['Bid Submission End Date (Online)'],true)}};
}
export async function readPdf(buffer) {
  if (buffer.subarray(0,5).toString() !== '%PDF-') throw new Error('Linked file is not a PDF');
  const dir = await mkdtemp(join(tmpdir(),'seci-pdf-'));
  try {
    const input = join(dir,'source.pdf'), output = join(dir,'source.txt');
    await writeFile(input,buffer);
    await exec('pdftotext',['-layout',input,output],{timeout:60000,maxBuffer:1024*1024});
    const text = await readFile(output,'utf8');
    if (text.length > 4_000_000) throw new Error('PDF text exceeds processing limit');
    const pages = text.split('\f');
    if (!pages.at(-1)?.trim()) pages.pop();
    if (pages.length > 500) throw new Error('PDF exceeds 500 pages; process it separately');
    return pages;
  } finally { await rm(dir,{recursive:true,force:true}); }
}
export function pageChunks(pages, size = 32000) {
  const chunks = []; let text = '';
  for (const [i,page] of pages.entries()) {
    const prefix=`\n[PDF PAGE ${i+1}]\n`, width=Math.max(1,size-prefix.length-1);
    for(let offset=0;offset<Math.max(1,page.length);offset+=width) {
      const block = `${prefix}${page.slice(offset,offset+width)}\n`;
      if (text && text.length + block.length > size) { chunks.push(text); text = ''; }
      text += block;
    }
  }
  if (text) chunks.push(text);
  return chunks;
}

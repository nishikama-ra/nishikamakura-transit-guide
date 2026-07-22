import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDirectory = path.join(root, 'agent-history', 'codex', '2026-07-22-school-url-recovery');
const data = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'school-official-url-overrides.json'), 'utf8'));
const timeoutMs = 15000;
const concurrency = 12;
const grouped = new Map();
for (const [institutionId, item] of Object.entries(data.institutions || {})) {
  if (!grouped.has(item.officialUrl)) grouped.set(item.officialUrl, []);
  grouped.get(item.officialUrl).push({ institutionId, name: item.name });
}

async function probe(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; NishikamakuraTransitGuide/1.0; URL validation)',
        accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8'
      }
    });
    return {
      status: response.status,
      ok: response.ok,
      finalUrl: response.url,
      contentType: response.headers.get('content-type'),
      elapsedMs: Date.now() - startedAt,
      error: null
    };
  } catch (error) {
    return {
      status: null,
      ok: false,
      finalUrl: null,
      contentType: null,
      elapsedMs: Date.now() - startedAt,
      error: error?.cause?.code || error?.name || String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

const urls = [...grouped.keys()].sort();
const results = new Array(urls.length);
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= urls.length) return;
    const url = urls[index];
    results[index] = { url, references: grouped.get(url), ...(await probe(url)) };
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));

const successful = results.filter(item => item.ok);
const failed = results.filter(item => !item.ok);
const report = {
  checkedAt: new Date().toISOString(),
  timeoutMs,
  uniqueUrlCount: results.length,
  successfulUrlCount: successful.length,
  failedUrlCount: failed.length,
  results
};
fs.mkdirSync(reportDirectory, { recursive: true });
fs.writeFileSync(path.join(reportDirectory, 'url-check.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const markdown = [
  '# 学校公式URL検査結果',
  '',
  `- 検査日時: ${report.checkedAt}`,
  `- URL総数: ${results.length}`,
  `- 成功: ${successful.length}`,
  `- 失敗: ${failed.length}`,
  '',
  '## 失敗URL',
  '',
  '| HTTP/エラー | URL | 掲載対象 |',
  '|---|---|---|',
  ...failed.map(item => `| ${item.status ?? item.error} | ${item.url} | ${item.references.map(ref => ref.name).join('／')} |`),
  '',
  '## リダイレクトされたURL',
  '',
  '| 元URL | 最終URL |',
  '|---|---|',
  ...successful.filter(item => item.finalUrl && item.finalUrl !== item.url).map(item => `| ${item.url} | ${item.finalUrl} |`),
  ''
].join('\n');
fs.writeFileSync(path.join(reportDirectory, 'url-check.md'), markdown, 'utf8');
console.log(JSON.stringify({ uniqueUrlCount: results.length, successfulUrlCount: successful.length, failedUrlCount: failed.length, failed: failed.map(item => ({ url: item.url, status: item.status, error: item.error, names: item.references.map(ref => ref.name) })) }, null, 2));

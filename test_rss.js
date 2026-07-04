const instances = [
  'https://hub.slarker.me',
  'https://rsshub.rsshub.net',
  'https://rsshub.lihaoyu.cn',
  'https://rss.shab.fun'
];
const route = '/36kr/motif/3276897824862212';

async function test(u) {
  try {
    const resp = await fetch(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 PanoramaCollector/2.0',
        'Accept': 'application/xml, text/xml, application/json, */*'
      }
    });
    const text = await resp.text();
    if (resp.status === 200 && text.includes('<title>')) {
      console.log(`[SUCCESS] ${u} : ${text.length} bytes`);
    } else {
      console.log(`[FAILED] ${u} : HTTP ${resp.status}`);
    }
  } catch (e) {
    console.log(`[ERROR] ${u} : ${e.code || e.message}`);
  }
}

async function main() {
  for (const host of instances) {
    await test(host + route);
  }
}

main();

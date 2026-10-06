const instances = [
  'https://hub.slarker.me',
  'https://rsshub.rsshub.net',
  'https://rsshub.lihaoyu.cn',
  'https://rss.shab.fun'
];
const route = '/36kr/motif/3276897824862212';

async function test(u) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 PanoramaCollector/2.0',
          'Accept': 'application/xml, text/xml, application/json, */*'
        }
      });
      const text = await resp.text();
      if (resp.status === 200 && (text.includes('<title>') || text.includes('"title"') || text.includes('"items"'))) {
        console.log(`[SUCCESS] ${u} : ${text.length} bytes`);
        return;
      } else {
        console.log(`[FAILED] ${u} : HTTP ${resp.status}`);
        return;
      }
    } catch (e) {
      if (attempt === 3) {
        console.log(`[ERROR] ${u} : ${e.code || e.message}`);
      }
    }
  }
}

async function main() {
  console.log('--- 测试 36kr RSSHub 镜像 ---');
  for (const host of instances) {
    await test(host + route);
  }

  console.log('\n--- 测试 HotAI 快讯 源 ---');
  await test('https://hotai.news/feed.xml');
  await test('https://hotai.news/news-report.json');
}

main();

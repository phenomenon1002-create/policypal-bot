const express = require('express');
const crypto = require('crypto');
const https = require('https');

const app = express();
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

const CHANNEL_SECRET = '1df0ef046c91ae10c044418b6a537093';
const CHANNEL_TOKEN = 'ssl5lO057bLYBVdlqMwxNohdHHEjoJiUy9XM+ovP43Fb5ZruJmZCSqOZngje0wMhpH87GqJfk5NfZh5tfzgo3OD/kqUqxuCOC5h2oyYVAIrXZxJfcm+K6EdJiAzwpc7HCAHt3o55V8u3ozysbgIZlgdB04t89/1O/w1cDnyilFU=';
const SUPABASE_URL = 'https://bayjzxyacueqinjheljy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJheWp6eHlhY3VlcWluamhlbGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjYwNDEsImV4cCI6MjA5NDk0MjA0MX0.ZVvhMOkv5yA22z3nU84JzfLPt5dQkd2olHCj2jkLc_s';

// Supabase helper
async function sb(path, method='GET', body=null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + path);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve([]); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// LINE reply helper
async function reply(replyToken, messages) {
  const body = JSON.stringify({ replyToken, messages: Array.isArray(messages) ? messages : [messages] });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.line.me',
      path: '/v2/bot/message/reply',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CHANNEL_TOKEN,
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function text(msg) { return { type: 'text', text: msg }; }

app.get('/', (req, res) => res.send('PolicyPal Bot running! 🛡️'));

app.post('/webhook', async (req, res) => {
  // 驗證簽名
  const sig = req.headers['x-line-signature'];
  const hash = crypto.createHmac('sha256', CHANNEL_SECRET).update(req.rawBody).digest('base64');
  if (sig !== hash) return res.status(401).end();

  res.status(200).json({ status: 'ok' });

  const events = req.body.events || [];
  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    try {
      await handleMsg(event);
    } catch(e) {
      console.error('handleMsg error:', e.message);
    }
  }
});

async function handleMsg(event) {
  const uid = event.source.userId;
  const txt = event.message.text.trim();
  const token = event.replyToken;

  // 查用戶綁定
  const users = await sb(`users?line_uid=eq.${uid}&select=*`);
  const user = users[0];

  if (!user) {
    if (/^09\d{8}$/.test(txt)) {
      const clients = await sb(`clients?phone=eq.${txt}&select=*`);
      const c = clients[0];
      if (!c) return reply(token, text('❌ 查無此號碼\n請確認或聯繫業務員'));
      await sb('users', 'POST', { line_uid: uid, client_id: c.id, phone: txt });
      return reply(token, text(`✅ 綁定成功！\n\n嗨，${c.name}！歡迎使用 PolicyPal 🛡️\n\n可以查詢：\n🏥 住院日額\n🔪 開刀手術\n🎗️ 確診癌症\n👶 生育給付\n📋 所有保單\n📅 繳費時程`));
    }
    return reply(token, text('👋 歡迎使用 PolicyPal 保單夥伴！\n\n請輸入您的手機號碼\n（格式：0912345678）'));
  }

  const policies = await sb(`policies?client_id=eq.${user.client_id}&select=*`);
  const clients = await sb(`clients?id=eq.${user.client_id}&select=name`);
  const name = clients[0]?.name || '您';

  const msg = buildReply(txt, policies, name);
  return reply(token, msg);
}

function buildReply(txt, p, name) {
  if (txt.includes('住院') || txt.includes('日額')) {
    const list = p.filter(x => x.daily_benefit > 0);
    if (!list.length) return text('您目前沒有住院日額保單\n請洽業務員加強保障 😊');
    const total = list.reduce((s,x) => s+x.daily_benefit, 0);
    let msg = '🏥 住院日額試算\n' + '─'.repeat(20) + '\n';
    list.forEach(x => { msg += `${x.company}\n${x.policy_name}\n💰 $${x.daily_benefit.toLocaleString()}/天\n\n`; });
    msg += '─'.repeat(20) + '\n';
    msg += `每日合計：$${total.toLocaleString()} 元\n`;
    msg += `住院7天：$${(total*7).toLocaleString()} 元\n`;
    msg += `住院30天：$${(total*30).toLocaleString()} 元`;
    return text(msg);
  }
  if (txt.includes('開刀') || txt.includes('手術')) {
    const dl = p.filter(x => x.daily_benefit > 0);
    const sl = p.filter(x => x.surgery_benefit > 0);
    if (!dl.length && !sl.length) return text('您目前沒有手術保障\n建議洽業務員評估！');
    const td = dl.reduce((s,x) => s+x.daily_benefit, 0);
    const ts = sl.reduce((s,x) => s+x.surgery_benefit, 0);
    let msg = '🔪 手術住院試算\n' + '─'.repeat(20) + '\n';
    sl.forEach(x => { msg += `手術給付 ${x.company}：$${x.surgery_benefit.toLocaleString()}\n`; });
    if (td) msg += `住院日額7天：$${(td*7).toLocaleString()}\n`;
    msg += '─'.repeat(20) + '\n';
    msg += `預估合計：$${(ts+td*7).toLocaleString()} 元\n⚠️ 實際依保單條款為準`;
    return text(msg);
  }
  if (txt.includes('癌症') || txt.includes('罹癌')) {
    const list = p.filter(x => x.type==='癌症險'||x.type==='重大疾病險');
    if (!list.length) return text('您目前沒有癌症險\n強烈建議洽業務員加強！🎗️');
    const total = list.reduce((s,x) => s+(x.lump_sum||0)*10000, 0);
    let msg = '🎗️ 癌症保障試算\n' + '─'.repeat(20) + '\n';
    list.forEach(x => { msg += `${x.company} ${x.type}\n${x.policy_name}：${x.lump_sum||0}萬\n\n`; });
    msg += '─'.repeat(20) + '\n';
    msg += `一次給付合計：$${total.toLocaleString()} 元\n⚠️ 實際依保單條款為準`;
    return text(msg);
  }
  if (txt.includes('生小孩')||txt.includes('生育')||txt.includes('懷孕')) {
    const list = p.filter(x => x.maternity_benefit > 0);
    if (!list.length) return text('您目前的保單沒有生育給付\n請洽業務員確認！👶');
    const total = list.reduce((s,x) => s+x.maternity_benefit, 0);
    let msg = '👶 生育給付查詢\n' + '─'.repeat(20) + '\n';
    list.forEach(x => { msg += `${x.company}：$${x.maternity_benefit.toLocaleString()}\n`; });
    msg += '─'.repeat(20) + '\n';
    msg += `生育給付合計：$${total.toLocaleString()} 元\n恭喜即將迎接新生命！🎉`;
    return text(msg);
  }
  if (txt.includes('繳費')||txt.includes('什麼時候')) {
    const list = p.filter(x => x.due_date && x.annual_premium > 0).sort((a,b) => a.due_date.localeCompare(b.due_date));
    if (!list.length) return text('繳費資料尚未建立\n請洽業務員更新');
    const total = list.reduce((s,x) => s+x.annual_premium, 0);
    let msg = '📅 年度繳費時程\n' + '─'.repeat(20) + '\n';
    list.forEach(x => { msg += `${x.due_date} ${x.company}\n${x.policy_name}\n💰 $${x.annual_premium.toLocaleString()}\n\n`; });
    msg += '─'.repeat(20) + '\n';
    msg += `年繳合計：$${total.toLocaleString()} 元\n每月約：$${Math.round(total/12).toLocaleString()} 元`;
    return text(msg);
  }
  if (txt.includes('所有')||txt.includes('清單')||txt.includes('保單')) {
    if (!p.length) return text('您目前尚無保單資料');
    let msg = `📋 所有保單（共${p.length}張）\n` + '─'.repeat(20) + '\n';
    p.forEach(x => {
      const val = x.daily_benefit ? `$${x.daily_benefit.toLocaleString()}/天` : x.lump_sum ? `${x.lump_sum}萬` : '—';
      msg += `${x.company} ${x.type}\n${x.policy_name}：${val}\n\n`;
    });
    return text(msg.trim());
  }
  return text(`嗨，${name}！👋\n\nPolicyPal 可以幫您查：\n\n🏥 住院日額\n🔪 開刀手術\n🎗️ 確診癌症\n👶 生育給付\n📋 所有保單\n📅 繳費時程\n\n直接輸入關鍵字即可！`);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PolicyPal running on port ${PORT}`));

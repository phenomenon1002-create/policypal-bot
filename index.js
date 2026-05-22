const express = require('express');
const crypto = require('crypto');
const https = require('https');

const app = express();

const LINE_SECRET = '1df0ef046c91ae10c044418b6a537093';
const LINE_TOKEN = 'ssl5lO057bLY7TrVjNV8oOSwRL11d4v7mAMlEFfSPIKNBuFZWiKNrBcmH1mriZd1Y/kv0u7xz/1/N9h9RfK8GV2CmTFXh25AuEaGN7aN0IfDMJHbfxThEjRcVHcVJJ5MDd04t895/1O/w1cDnyilFU=';
const SUPABASE_URL = 'https://bayjzxyacueqinjheljy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJheWp6eHlhY3VlcWluamhlbGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjYwNDEsImV4cCI6MjA5NDk0MjA0MX0.ZVvhMOkv5yA22z3nU84JzfLPt5dQkd2olHCj2jkLc_s';

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

function sbFetch(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + path);
    const options = {
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
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(data ? JSON.parse(data) : []); }
        catch(e) { resolve([]); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function lineReply(token, messages) {
  const body = JSON.stringify({ replyToken: token, messages: Array.isArray(messages) ? messages : [messages] });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.line.me',
      path: '/v2/bot/message/reply',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + LINE_TOKEN
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function text(t) { return { type: 'text', text: t }; }

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const sig = req.headers['x-line-signature'];
  const hmac = crypto.createHmac('sha256', LINE_SECRET).update(req.rawBody).digest('base64');
  if (sig !== hmac) return;

  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    const uid = event.source.userId;
    const txt = event.message.text.trim();
    const replyToken = event.replyToken;

    try {
      // 查詢綁定
      let users = await sbFetch(`users?line_uid=eq.${uid}&select=*,clients(*)`);
      
      // 未綁定 - 輸入手機號碼
      if (!users.length) {
        const phoneMatch = txt.match(/^09\d{8}$/);
        if (phoneMatch) {
          const phone = txt;
          const clients = await sbFetch(`clients?phone=eq.${phone}&select=*`);
          if (!clients.length) {
            await lineReply(replyToken, text('❌ 查無此手機號碼\n請聯繫您的業務員確認！'));
          } else {
            const client = clients[0];
            // 檢查users表是否有phone欄位，若無先嘗試不帶phone
            try {
              await sbFetch('users', 'POST', { line_uid: uid, client_id: client.id, phone });
            } catch(e) {
              await sbFetch('users', 'POST', { line_uid: uid, client_id: client.id });
            }
            await lineReply(replyToken, text(`✅ 綁定成功！\n\n嗨，${client.name}！歡迎使用保寶險 🐾\n\n您可以查詢：\n🏥 住院日額\n🔪 開刀手術\n🎗️ 確診癌症\n👶 生育給付\n📋 所有保單\n📅 繳費時程`));
          }
        } else {
          await lineReply(replyToken, text('👋 歡迎使用保寶險！\n\n請輸入您的手機號碼綁定保單\n格式：09xxxxxxxx'));
        }
        continue;
      }

      const client = users[0].clients;
      const name = client.name;
      const cid = client.id;
      const p = await sbFetch(`policies?client_id=eq.${cid}&select=*`);

      if (txt.includes('住院') || txt.includes('日額')) {
        const list = p.filter(x => x.daily_benefit > 0);
        if (!list.length) { await lineReply(replyToken, text('您目前的保單沒有住院日額給付')); continue; }
        const total = list.reduce((s, x) => s + x.daily_benefit, 0);
        let msg = '🏥 住院日額查詢\n' + '─'.repeat(20) + '\n';
        list.forEach(x => { msg += `${x.company}\n${x.policy_name}：$${x.daily_benefit.toLocaleString()}/天\n\n`; });
        msg += '─'.repeat(20) + '\n合計：$' + total.toLocaleString() + '/天';
        await lineReply(replyToken, text(msg));
      } else if (txt.includes('開刀') || txt.includes('手術')) {
        const list = p.filter(x => x.surgery_benefit > 0);
        if (!list.length) { await lineReply(replyToken, text('您目前的保單沒有手術給付')); continue; }
        const total = list.reduce((s, x) => s + x.surgery_benefit, 0);
        let msg = '🔪 手術給付查詢\n' + '─'.repeat(20) + '\n';
        list.forEach(x => { msg += `${x.company}：$${x.surgery_benefit.toLocaleString()}\n`; });
        msg += '─'.repeat(20) + '\n合計：$' + total.toLocaleString();
        await lineReply(replyToken, text(msg));
      } else if (txt.includes('癌症') || txt.includes('確診')) {
        const list = p.filter(x => x.lump_sum > 0);
        if (!list.length) { await lineReply(replyToken, text('您目前的保單沒有一次給付')); continue; }
        const total = list.reduce((s, x) => s + x.lump_sum, 0);
        let msg = '🎗️ 一次給付查詢\n' + '─'.repeat(20) + '\n';
        list.forEach(x => { msg += `${x.company}：${x.lump_sum}萬\n`; });
        msg += '─'.repeat(20) + '\n合計：' + total + '萬';
        await lineReply(replyToken, text(msg));
      } else if (txt.includes('生育') || txt.includes('生小孩') || txt.includes('懷孕')) {
        const list = p.filter(x => x.maternity_benefit > 0);
        if (!list.length) { await lineReply(replyToken, text('您目前的保單沒有生育給付')); continue; }
        const total = list.reduce((s, x) => s + x.maternity_benefit, 0);
        let msg = '👶 生育給付查詢\n' + '─'.repeat(20) + '\n';
        list.forEach(x => { msg += `${x.company}：$${x.maternity_benefit.toLocaleString()}\n`; });
        msg += '─'.repeat(20) + '\n合計：$' + total.toLocaleString();
        await lineReply(replyToken, text(msg));
      } else if (txt.includes('繳費') || txt.includes('什麼時候')) {
        const list = p.filter(x => x.due_date && x.annual_premium > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
        if (!list.length) { await lineReply(replyToken, text('繳費資料尚未建立，請洽業務員')); continue; }
        const total = list.reduce((s, x) => s + x.annual_premium, 0);
        let msg = '📅 年度繳費時程\n' + '─'.repeat(20) + '\n';
        list.forEach(x => { msg += `${x.due_date} ${x.company}\n${x.policy_name}\n💰 $${x.annual_premium.toLocaleString()}\n\n`; });
        msg += '─'.repeat(20) + '\n年繳合計：$' + total.toLocaleString() + '\n每月約：$' + Math.round(total / 12).toLocaleString();
        await lineReply(replyToken, text(msg));
      } else if (txt.includes('所有') || txt.includes('清單') || txt.includes('保單')) {
        if (!p.length) { await lineReply(replyToken, text('您目前尚無保單資料')); continue; }
        let msg = `📋 所有保單（共${p.length}張）\n` + '─'.repeat(20) + '\n';
        p.forEach(x => {
          const val = x.daily_benefit ? `$${x.daily_benefit.toLocaleString()}/天` : x.lump_sum ? `${x.lump_sum}萬` : '—';
          msg += `${x.company} ${x.type}\n${x.policy_name}：${val}\n\n`;
        });
        await lineReply(replyToken, text(msg.trim()));
      } else {
        await lineReply(replyToken, text(`嗨，${name}！🐾\n\n可以查詢：\n🏥 住院日額\n🔪 開刀手術\n🎗️ 確診癌症\n👶 生育給付\n📋 所有保單\n📅 繳費時程\n\n直接輸入關鍵字即可！`));
      }
    } catch (e) {
      console.error(e);
      await lineReply(replyToken, text('系統忙碌中，請稍後再試'));
    }
  }
});

app.get('/', (req, res) => res.send('PolicyPal Bot is running! 🛡️'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PolicyPal running on port ${PORT}`));

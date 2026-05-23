const express = require('express');
const crypto = require('crypto');
const https = require('https');

const app = express();

const LINE_SECRET = '1df0ef046c91ae10c044418b6a537093';
const LINE_TOKEN = 'ssl5lO057bLYBVdlqMwxNohdHHEjoJiUy9XM+ovP43Fb5ZruJmZCSqOZngje0wMhpH87GqJfk5NfZh5tfzgo3O D/kqUqxuCOC5h2oyYVAIrXZxJfcm+K6EdJiAzwpc7HCAHt3o55V8u3ozysbgIZlgdB04t89/1O/w1cDnyilFU=';
const SUPABASE_URL = 'https://bayjzxyacueqinjheljy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJheWp6eHlhY3VlcWluamhlbGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjYwNDEsImV4cCI6MjA5NDk0MjA0MX0.ZVvhMOkv5yA22z3nU84JzfLPt5dQkd2olHCj2jkLc_s';

app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

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
      res.on('end', () => { try { resolve(data ? JSON.parse(data) : []); } catch(e) { resolve([]); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function lineReply(token, messages) {
  console.log('lineReply called, token:', token?.slice(0,10), 'msgType:', Array.isArray(messages)?messages[0]?.type:messages?.type);
  const body = JSON.stringify({ replyToken: token, messages: Array.isArray(messages) ? messages : [messages] });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.line.me',
      path: '/v2/bot/message/reply',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        console.log('LINE API response:', res.statusCode, d.slice(0,150));
        resolve(d);
      });
    });
    req.on('error', (e) => { console.error('LINE API error:', e.message); reject(e); });
    req.write(body);
    req.end();
  });
}

function text(t) { return { type: 'text', text: t }; }

// ── 醫療雙十字 Flex Message ──
function buildHealthFlex(client, pols) {
  const sum = k => pols.reduce((s, p) => s + (p[k] || 0), 0);
  const daily = sum('daily_benefit');
  const surgeryFixed = sum('surgery_benefit');
  const inpatient = sum('inpatient_benefit');
  const critical = sum('critical_illness');
  const cancer = sum('lump_sum');
  const life = sum('life_insurance');
  const ltc = sum('ltc_monthly');
  const accDeath = sum('accident_death');
  const disability = sum('disability_benefit');
  const fracture = sum('fracture_benefit');
  const premium = sum('annual_premium');

  let age = '未填';
  if (client.birthdate) {
    const bd = new Date(client.birthdate);
    age = Math.floor((new Date() - bd) / (365.25 * 24 * 3600 * 1000)) + '歲';
  }

  const issues = [];
  if (daily < 3000) issues.push('住院日額不足');
  if (life < 500) issues.push('壽險保額偏低');
  if (critical < 100 && cancer < 100) issues.push('重病保障不足');
  if (!ltc) issues.push('尚未規劃長照');
  if (!disability) issues.push('尚未規劃失能');

  const allGood = issues.length === 0;

  function statusRow(label, val, std, unit) {
    const ok = val >= std;
    return {
      type: 'box', layout: 'horizontal', paddingTop: '6px', paddingBottom: '6px',
      borderWidth: '1px', borderColor: '#f1f5f9',
      contents: [
        { type: 'text', text: label, size: 'xs', color: '#64748b', flex: 3 },
        {
          type: 'text',
          text: (ok ? '✓ ' : '! ') + val.toLocaleString() + ' ' + unit,
          size: 'xs', color: ok ? '#15803d' : '#dc2626',
          weight: 'bold', flex: 3, align: 'end'
        }
      ]
    };
  }

  function statusBool(label, has) {
    return {
      type: 'box', layout: 'horizontal', paddingTop: '6px', paddingBottom: '6px',
      contents: [
        { type: 'text', text: label, size: 'xs', color: '#64748b', flex: 3 },
        { type: 'text', text: has ? '✓ 已投保' : '! 未投保', size: 'xs', color: has ? '#15803d' : '#dc2626', weight: 'bold', flex: 3, align: 'end' }
      ]
    };
  }

  function qSection(title, rows) {
    return {
      type: 'box', layout: 'vertical',
      backgroundColor: '#ffffff', cornerRadius: '12px',
      paddingAll: '12px', margin: 'md',
      contents: [
        { type: 'text', text: title, size: 'sm', weight: 'bold', color: '#7c3aed', margin: 'none' },
        { type: 'separator', margin: 'sm', color: '#f1f5f9' },
        ...rows
      ]
    };
  }

  return {
    type: 'flex',
    altText: `🐾 ${client.name} 的保障健診報告`,
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: '#6d28d9',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🐾 保寶險 保障健診報告', color: '#ffffff', size: 'md', weight: 'bold' },
          { type: 'text', text: `醫療雙十字保障分析・${client.name}`, color: 'rgba(255,255,255,0.7)', size: 'xs', margin: 'sm' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        backgroundColor: '#f5f3ff',
        contents: [
          // 保寶說
          {
            type: 'box', layout: 'vertical',
            backgroundColor: allGood ? '#dcfce7' : '#fef3c7',
            cornerRadius: '12px', paddingAll: '12px', margin: 'none',
            contents: [{
              type: 'text',
              text: allGood ? '✨ 保寶說：保障規劃完整，做得很棒！' : `⚠️ 保寶說：發現 ${issues.length} 個缺口：${issues.join('、')}`,
              size: 'sm', color: allGood ? '#15803d' : '#92400e',
              weight: 'bold', wrap: true
            }]
          },
          // 客戶資訊
          {
            type: 'box', layout: 'horizontal', margin: 'md', spacing: 'sm',
            contents: [
              { type: 'box', layout: 'vertical', backgroundColor: '#ffffff', cornerRadius: '8px', paddingAll: '8px', flex: 1,
                contents: [
                  { type: 'text', text: '年齡', size: 'xxs', color: '#94a3b8' },
                  { type: 'text', text: age, size: 'sm', weight: 'bold', color: '#1e293b' }
                ]
              },
              { type: 'box', layout: 'vertical', backgroundColor: '#ffffff', cornerRadius: '8px', paddingAll: '8px', flex: 1,
                contents: [
                  { type: 'text', text: '年繳保費', size: 'xxs', color: '#94a3b8' },
                  { type: 'text', text: '$' + premium.toLocaleString(), size: 'sm', weight: 'bold', color: '#1e293b' }
                ]
              },
              { type: 'box', layout: 'vertical', backgroundColor: '#ffffff', cornerRadius: '8px', paddingAll: '8px', flex: 1,
                contents: [
                  { type: 'text', text: '保單數', size: 'xxs', color: '#94a3b8' },
                  { type: 'text', text: pols.length + ' 張', size: 'sm', weight: 'bold', color: '#1e293b' }
                ]
              }
            ]
          },
          // 壽險核心
          {
            type: 'box', layout: 'vertical',
            backgroundColor: '#ffffff', cornerRadius: '12px',
            paddingAll: '12px', margin: 'md',
            contents: [
              { type: 'box', layout: 'horizontal', contents: [
                { type: 'text', text: '💜 壽險保額（核心保障）', size: 'sm', weight: 'bold', color: '#7c3aed', flex: 1 },
                { type: 'text', text: life ? life + ' 萬' : '⚠️ 未投保', size: 'sm', weight: 'bold', color: life >= 500 ? '#15803d' : '#dc2626', align: 'end' }
              ]},
              { type: 'text', text: life >= 500 ? '✓ 保額充足' : '建議 500 萬以上', size: 'xs', color: life >= 500 ? '#15803d' : '#94a3b8', margin: 'sm' }
            ]
          },
          // 四象限
          {
            type: 'box', layout: 'horizontal', margin: 'md', spacing: 'sm',
            contents: [
              qSection('🏥 小疾病', [
                statusRow('住院日額', daily, 3000, '元/天'),
                statusRow('定額手術', surgeryFixed, 50000, '元'),
                statusRow('實支雜費', inpatient, 100000, '元'),
              ]),
              qSection('🩹 小意外', [
                statusRow('骨折未住院', fracture, 30000, '元'),
                statusBool('意外住院', daily > 0),
              ])
            ]
          },
          {
            type: 'box', layout: 'horizontal', margin: 'sm', spacing: 'sm',
            contents: [
              qSection('🎗️ 大疾病', [
                statusRow('重大疾病', critical, 100, '萬'),
                statusRow('癌症一次金', cancer, 100, '萬'),
                statusRow('長照月給付', ltc, 30000, '元/月'),
              ]),
              qSection('⚡ 大意外', [
                statusRow('意外身故', accDeath, 500, '萬'),
                statusRow('殘廢/全殘', disability, 500, '萬'),
                statusBool('失能扶助', pols.some(p => p.type === '失能險')),
              ])
            ]
          }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', backgroundColor: '#6d28d9', paddingAll: '12px',
        contents: [
          { type: 'text', text: '保寶險 AI 夥伴・保障更聰明', color: 'rgba(255,255,255,0.7)', size: 'xs', align: 'center' }
        ]
      }
    }
  };
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  console.log('Webhook received!', new Date().toISOString());
  console.log('Events:', JSON.stringify(req.body?.events?.map(e => ({type:e.type, msg:e.message?.text})) || []));
  
  const sig = req.headers['x-line-signature'];
  const hmac = crypto.createHmac('sha256', LINE_SECRET).update(req.rawBody).digest('base64');
  if (sig !== hmac) {
    console.log('Signature mismatch! sig:', sig?.slice(0,10), 'hmac:', hmac?.slice(0,10));
    return;
  }
  console.log('Signature OK!');

  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    const uid = event.source.userId;
    const txt = event.message.text.trim();
    const replyToken = event.replyToken;
    console.log('Processing msg:', txt, 'uid:', uid.slice(0,8));

    try {
      console.log('Fetching user from Supabase...');
      let users = await sbFetch(`users?line_uid=eq.${uid}&select=*,clients(*)`);
      console.log('Users found:', users.length);
      if (users.length) console.log('User data:', JSON.stringify(users[0]).slice(0,200));

      if (!users.length) {
        const phoneMatch = txt.match(/^09\d{8}$/);
        if (phoneMatch) {
          const phone = txt;
          const clients = await sbFetch(`clients?phone=eq.${phone}&select=*`);
          if (!clients.length) {
            await lineReply(replyToken, text('❌ 查無此手機號碼\n請聯繫您的業務員確認！'));
          } else {
            const client = clients[0];
            try { await sbFetch('users', 'POST', { line_uid: uid, client_id: client.id, phone }); }
            catch(e) { await sbFetch('users', 'POST', { line_uid: uid, client_id: client.id }); }
            await lineReply(replyToken, text(`✅ 綁定成功！\n\n嗨，${client.name}！歡迎使用保寶險 🐾\n\n您可以查詢：\n🏥 住院日額\n🔪 開刀手術\n🎗️ 確診癌症\n👶 生育給付\n📋 所有保單\n📅 繳費時程\n🔍 保障健診`));
          }
        } else {
          await lineReply(replyToken, text('👋 歡迎使用保寶險！\n\n請輸入您的手機號碼綁定保單\n格式：09xxxxxxxx'));
        }
        continue;
      }

      const client = users[0].clients;
      console.log('Client:', JSON.stringify(client)?.slice(0,100));
      if (!client) { await lineReply(replyToken, text('找不到客戶資料，請重新綁定手機號碼')); continue; }
      const name = client.name;
      const cid = client.id;
      console.log('Fetching policies for:', cid);
      const p = await sbFetch(`policies?client_id=eq.${cid}&select=*`);
      console.log('Policies found:', p.length);

      // ── 保障健診 ──
      console.log('Checking keywords for:', txt);
      if (txt.includes('健診') || txt.includes('雙十字') || txt.includes('保障分析') || txt.includes('缺口')) {
        console.log('Building health flex...');
        const flexMsg = buildHealthFlex(client, p);
        console.log('Sending flex message...');
        await lineReply(replyToken, flexMsg);
        console.log('Flex sent!');
      }
      // ── 住院日額 ──
      else if (txt.includes('住院') || txt.includes('日額')) {
        const list = p.filter(x => x.daily_benefit > 0);
        if (!list.length) { await lineReply(replyToken, text('您目前的保單沒有住院日額給付')); continue; }
        const total = list.reduce((s, x) => s + x.daily_benefit, 0);
        let msg = '🏥 住院日額查詢\n' + '─'.repeat(20) + '\n';
        list.forEach(x => { msg += `${x.company}\n${x.policy_name}：$${x.daily_benefit.toLocaleString()}/天\n\n`; });
        msg += '─'.repeat(20) + '\n合計：$' + total.toLocaleString() + '/天';
        await lineReply(replyToken, text(msg));
      }
      // ── 手術 ──
      else if (txt.includes('開刀') || txt.includes('手術')) {
        const list = p.filter(x => x.surgery_benefit > 0);
        if (!list.length) { await lineReply(replyToken, text('您目前的保單沒有手術給付')); continue; }
        const total = list.reduce((s, x) => s + x.surgery_benefit, 0);
        let msg = '🔪 手術給付查詢\n' + '─'.repeat(20) + '\n';
        list.forEach(x => { msg += `${x.company}：$${x.surgery_benefit.toLocaleString()}\n`; });
        msg += '─'.repeat(20) + '\n合計：$' + total.toLocaleString();
        await lineReply(replyToken, text(msg));
      }
      // ── 癌症 ──
      else if (txt.includes('癌症') || txt.includes('確診') || txt.includes('重大')) {
        const list = p.filter(x => x.lump_sum > 0 || x.critical_illness > 0);
        if (!list.length) { await lineReply(replyToken, text('您目前的保單沒有一次給付')); continue; }
        const total = list.reduce((s, x) => s + (x.lump_sum || 0) + (x.critical_illness || 0), 0);
        let msg = '🎗️ 重病/癌症一次金\n' + '─'.repeat(20) + '\n';
        list.forEach(x => {
          if (x.lump_sum) msg += `${x.company}：${x.lump_sum}萬（癌症）\n`;
          if (x.critical_illness) msg += `${x.company}：${x.critical_illness}萬（重大疾病）\n`;
        });
        msg += '─'.repeat(20) + '\n合計：' + total + '萬';
        await lineReply(replyToken, text(msg));
      }
      // ── 生育 ──
      else if (txt.includes('生育') || txt.includes('生小孩') || txt.includes('懷孕')) {
        const list = p.filter(x => x.maternity_benefit > 0);
        if (!list.length) { await lineReply(replyToken, text('您目前的保單沒有生育給付')); continue; }
        const total = list.reduce((s, x) => s + x.maternity_benefit, 0);
        let msg = '👶 生育給付查詢\n' + '─'.repeat(20) + '\n';
        list.forEach(x => { msg += `${x.company}：$${x.maternity_benefit.toLocaleString()}\n`; });
        msg += '─'.repeat(20) + '\n合計：$' + total.toLocaleString();
        await lineReply(replyToken, text(msg));
      }
      // ── 繳費 ──
      else if (txt.includes('繳費') || txt.includes('什麼時候')) {
        const list = p.filter(x => x.due_date && x.annual_premium > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
        if (!list.length) { await lineReply(replyToken, text('繳費資料尚未建立，請洽業務員')); continue; }
        const total = list.reduce((s, x) => s + x.annual_premium, 0);
        let msg = '📅 年度繳費時程\n' + '─'.repeat(20) + '\n';
        list.forEach(x => { msg += `${x.due_date} ${x.company}\n${x.policy_name}\n💰 $${x.annual_premium.toLocaleString()}\n\n`; });
        msg += '─'.repeat(20) + '\n年繳合計：$' + total.toLocaleString() + '\n每月約：$' + Math.round(total / 12).toLocaleString();
        await lineReply(replyToken, text(msg));
      }
      // ── 所有保單 ──
      else if (txt.includes('所有') || txt.includes('清單') || txt.includes('保單')) {
        if (!p.length) { await lineReply(replyToken, text('您目前尚無保單資料')); continue; }
        let msg = `📋 所有保單（共${p.length}張）\n` + '─'.repeat(20) + '\n';
        p.forEach(x => {
          const val = x.daily_benefit ? `$${x.daily_benefit.toLocaleString()}/天` : x.lump_sum ? `${x.lump_sum}萬` : '—';
          msg += `${x.company} ${x.type}\n${x.policy_name}：${val}\n\n`;
        });
        await lineReply(replyToken, text(msg.trim()));
      }
      // ── 預設選單 ──
      else {
        console.log('Sending default menu...');
        await lineReply(replyToken, text(`嗨，${name}！🐾\n\n可以查詢：\n🏥 住院日額\n🔪 開刀手術\n🎗️ 確診癌症\n👶 生育給付\n📋 所有保單\n📅 繳費時程\n🔍 保障健診\n\n直接輸入關鍵字即可！`));
      }

    } catch (e) {
      console.error('ERROR:', e.message, e.stack?.slice(0,200));
      try { await lineReply(replyToken, text('系統忙碌中，請稍後再試')); } catch(e2) { console.error('Reply failed:', e2.message); }
    }
  }
});

app.get('/', (req, res) => res.send('PolicyPal Bot is running! 🐾'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PolicyPal running on port ${PORT}`));

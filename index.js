const express = require('express');
const crypto = require('crypto');
const https = require('https');
const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

const CHANNEL_SECRET = '1df0ef046c91ae10c044418b6a537093';
const CHANNEL_TOKEN = 'ssl5lO057bLYBVdlqMwxNohdHHEjoJiUy9XM+ovP43Fb5ZruJmZCSqOZngje0wMhpH87GqJfk5NfZh5tfzgo3O D/kqUqxuCOC5h2oyYVAIrXZxJfcm+K6EdJiAzwpc7HCAHt3o55V8u3ozysbgIZlgdB04t89/1O/w1cDnyilFU=';
const SUPABASE_URL = 'https://bayjzxyacueqinjheljy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJheWp6eHlhY3VlcWluamhlbGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjYwNDEsImV4cCI6MjA5NDk0MjA0MX0.ZVvhMOkv5yA22z3nU84JzfLPt5dQkd2olHCj2jkLc_s';

async function sb(path, method='GET', body=null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve([]); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function replyMsg(token, messages) {
  const body = JSON.stringify({ replyToken: token, messages: Array.isArray(messages) ? messages : [messages] });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.line.me', path: '/v2/bot/message/reply', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CHANNEL_TOKEN }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d)); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function generateImage(data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: 'policypal-image.vercel.app',
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(d);
          if (result.url) resolve(result.url);
          else reject(new Error(d));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function pushMsg(uid, messages) {
  const body = JSON.stringify({ to: uid, messages: Array.isArray(messages) ? messages : [messages] });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.line.me', path: '/v2/bot/message/push', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CHANNEL_TOKEN }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d)); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function flexRow(label, value, valueColor='#1a56db') {
  return {
    type: 'box', layout: 'horizontal', paddingAll: '10px',
    backgroundColor: '#f8fafc', cornerRadius: '8px',
    contents: [
      { type: 'box', layout: 'vertical', flex: 3, contents: [
        { type: 'text', text: label, size: 'sm', weight: 'bold', color: '#1e293b', wrap: true }
      ]},
      { type: 'text', text: value, size: 'sm', weight: 'bold', color: valueColor, align: 'end', flex: 2 }
    ]
  };
}

function flexSubRow(label, sub, value) {
  return {
    type: 'box', layout: 'horizontal', paddingAll: '10px',
    backgroundColor: '#f8fafc', cornerRadius: '8px',
    contents: [
      { type: 'box', layout: 'vertical', flex: 3, contents: [
        { type: 'text', text: label, size: 'sm', weight: 'bold', color: '#1e293b' },
        { type: 'text', text: sub, size: 'xs', color: '#94a3b8', wrap: true }
      ]},
      { type: 'text', text: value, size: 'sm', weight: 'bold', color: '#1a56db', align: 'end', flex: 2 }
    ]
  };
}

function flexTotal(label, value) {
  return {
    type: 'box', layout: 'horizontal', paddingAll: '12px',
    backgroundColor: '#dbeafe', cornerRadius: '8px', margin: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', weight: 'bold', color: '#1e40af' },
      { type: 'text', text: value, size: 'md', weight: 'bold', color: '#1a56db', align: 'end' }
    ]
  };
}

function buildFlex(title, headerColor, emoji, items, totalLabel, totalValue, note) {
  const bodyContents = [
    ...items.map(i => i.sub ? flexSubRow(i.label, i.sub, i.value) : flexRow(i.label, i.value, i.color)),
    ...(totalLabel ? [flexTotal(totalLabel, totalValue)] : []),
    ...(note ? [{ type: 'text', text: note, size: 'xs', color: '#94a3b8', margin: 'sm', wrap: true }] : [])
  ];
  const separated = [];
  bodyContents.forEach((item, i) => {
    separated.push(item);
    if (i < bodyContents.length - 1) separated.push({ type: 'separator', margin: 'sm' });
  });
  return {
    type: 'flex', altText: title,
    contents: {
      type: 'bubble', size: 'giga',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '14px',
        backgroundColor: headerColor,
        contents: [{ type: 'text', text: emoji + ' ' + title, color: '#ffffff', weight: 'bold', size: 'lg' }]
      },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents: separated }
    }
  };
}

function quickReply(items) {
  return { items: items.map(i => ({ type: 'action', action: { type: 'message', label: i.label, text: i.text } })) };
}

function menuBtn(emoji, label, text) {
  return {
    type: 'box', layout: 'vertical', flex: 1,
    backgroundColor: '#f8fafc', cornerRadius: '12px', paddingAll: '12px',
    action: { type: 'message', label, text },
    contents: [
      { type: 'text', text: emoji, size: 'xl', align: 'center' },
      { type: 'text', text: label, size: 'sm', align: 'center', weight: 'bold', color: '#1e293b' }
    ]
  };
}

function mainMenu(name) {
  return {
    type: 'flex', altText: `嗨 ${name}！歡迎使用 PolicyPal 🛡️`,
    contents: {
      type: 'bubble', size: 'giga',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        backgroundColor: '#0f1f3d',
        contents: [
          { type: 'text', text: '🛡️ PolicyPal 保單夥伴', color: '#ffffff', weight: 'bold', size: 'lg' },
          { type: 'text', text: `嗨，${name}！請選擇查詢項目`, color: '#94a3b8', size: 'sm', margin: 'sm' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
        contents: [
          { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [ menuBtn('🏥', '住院日額', '住院日額'), menuBtn('🔪', '要開刀', '要開刀') ]},
          { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [ menuBtn('🎗️', '確診癌症', '確診癌症'), menuBtn('👶', '要生小孩', '要生小孩') ]},
          { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [ menuBtn('📋', '所有保單', '所有保單'), menuBtn('📅', '繳費時程', '繳費時程') ]},
          { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [ menuBtn('💰', '保費查詢', '保費查詢'), menuBtn('🔍', '保單健診', '保單健診') ]},
        ]
      }
    }
  };
}

app.get('/', (req, res) => res.send('PolicyPal Bot is running! 🐾'));

app.post('/webhook', async (req, res) => {
  const sig = req.headers['x-line-signature'];
  const hash = crypto.createHmac('sha256', CHANNEL_SECRET).update(req.rawBody).digest('base64');
  if (sig !== hash) return res.status(401).end();
  res.status(200).json({ status: 'ok' });
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    try { await handleMsg(event); } catch(e) { console.error(e.message); }
  }
});

async function handleMsg(event) {
  const uid = event.source.userId;
  const txt = event.message.text.trim();
  const token = event.replyToken;

  const users = await sb(`users?line_uid=eq.${encodeURIComponent(uid)}&select=*`);
  const user = users[0];

  if (!user) {
    if (/^09\d{8}$/.test(txt)) {
      const clients = await sb(`clients?phone=eq.${txt}&select=*`);
      const c = clients[0];
      if (!c) return replyMsg(token, { type: 'text', text: '❌ 查無此號碼\n請確認或聯繫您的業務員' });
      await sb('users', 'POST', { line_uid: uid, client_id: c.id, phone: txt });
      return replyMsg(token, [
        { type: 'text', text: `✅ 綁定成功！嗨，${c.name}！` },
        mainMenu(c.name)
      ]);
    }
    return replyMsg(token, {
      type: 'flex', altText: '歡迎使用 PolicyPal 保單夥伴',
      contents: {
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', backgroundColor: '#0f1f3d', paddingAll: '20px',
          contents: [
            { type: 'text', text: '🛡️ PolicyPal', color: '#ffffff', weight: 'bold', size: 'xxl' },
            { type: 'text', text: '保單夥伴 · Insurance Partner', color: '#94a3b8', size: 'sm' }
          ]
        },
        body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
          contents: [
            { type: 'text', text: '請輸入您的手機號碼', size: 'md', weight: 'bold', align: 'center' },
            { type: 'text', text: '格式：0912345678', size: 'sm', color: '#94a3b8', align: 'center' },
            { type: 'box', layout: 'vertical', backgroundColor: '#f8fafc', cornerRadius: '10px', paddingAll: '12px',
              contents: [{ type: 'text', text: '📱 輸入手機號碼即可查看您的保障內容', size: 'sm', color: '#475569', wrap: true }]
            }
          ]
        }
      }
    });
  }

  const policies = await sb(`policies?client_id=eq.${user.client_id}&select=*`);
  const clientData = await sb(`clients?id=eq.${user.client_id}&select=name`);
  const name = clientData[0]?.name || '您';

  // 主選單
  if (txt === '選單' || txt === 'menu' || txt === '你好' || txt === '嗨') {
    return replyMsg(token, mainMenu(name));
  }

  // 住院日額
  if (txt.includes('住院') || txt.includes('日額')) {
    const list = policies.filter(p => p.daily_benefit > 0);
    if (!list.length) return replyMsg(token, { type: 'text', text: '您目前沒有住院日額保單\n請洽業務員規劃' });
    const total = list.reduce((s,p) => s+p.daily_benefit, 0);
    const flex = buildFlex('住院日額試算', '#0f1f3d', '🏥',
      list.map(p => ({ label: p.company, sub: p.policy_name, value: `$${p.daily_benefit.toLocaleString()}/天` })),
      '每日合計', `$${total.toLocaleString()} 元`, null
    );
    const summary = { type: 'text', text: `🏥 住院7天：$${(total*7).toLocaleString()} 元\n住院30天：$${(total*30).toLocaleString()} 元`,
      quickReply: quickReply([{label:'要開刀',text:'要開刀'},{label:'所有保單',text:'所有保單'},{label:'回主選單',text:'選單'}]) };
    return replyMsg(token, [flex, summary]);
  }

  // 開刀手術
  if (txt.includes('開刀') || txt.includes('手術')) {
    const dl = policies.filter(p => p.daily_benefit > 0);
    const sl = policies.filter(p => p.surgery_benefit > 0);
    if (!dl.length && !sl.length) return replyMsg(token, { type: 'text', text: '您目前沒有手術保單\n請洽業務員規劃' });
    const td = dl.reduce((s,p) => s+p.daily_benefit, 0);
    const ts = sl.reduce((s,p) => s+p.surgery_benefit, 0);
    const items = [
      ...sl.map(p => ({ label: p.company, sub: `${p.policy_name} · 手術給付`, value: `$${p.surgery_benefit.toLocaleString()}` })),
      ...(td ? [{ label: '住院日額（7天計）', sub: '各保單合計', value: `$${(td*7).toLocaleString()}` }] : [])
    ];
    const flex = buildFlex('手術住院試算', '#1a1a2e', '🔪', items, '預估合計', `$${(ts+td*7).toLocaleString()} 元`, '⚠️ 實際理賠依保單條款為準');
    return replyMsg(token, [flex, { type: 'text', text: '如需申請理賠，請聯繫您的業務員協助辦理 💪',
      quickReply: quickReply([{label:'住院日額',text:'住院日額'},{label:'所有保單',text:'所有保單'},{label:'回主選單',text:'選單'}]) }]);
  }

  // 癌症
  if (txt.includes('癌症') || txt.includes('罹癌') || txt.includes('確診')) {
    const list = policies.filter(p => p.type==='癌症險'||p.type==='重大疾病險');
    if (!list.length) return replyMsg(token, { type: 'text', text: '您目前沒有癌症險\n強烈建議洽業務員規劃' });
    const total = list.reduce((s,p) => s+(p.lump_sum||0)*10000, 0);
    const flex = buildFlex('癌症保障試算', '#4a1942', '🎗️',
      list.map(p => ({ label: p.company, sub: `${p.policy_name} · ${p.type}`, value: p.lump_sum ? `${p.lump_sum}萬` : '—' })),
      '一次給付合計', `$${total.toLocaleString()} 元`, '⚠️ 實際理賠依保單條款為準'
    );
    return replyMsg(token, [flex, { type: 'text', text: '如需申請理賠，請聯繫您的業務員 💪',
      quickReply: quickReply([{label:'住院日額',text:'住院日額'},{label:'回主選單',text:'選單'}]) }]);
  }

  // 生育
  if (txt.includes('生小孩')||txt.includes('生育')||txt.includes('懷孕')||txt.includes('要生')) {
    const list = policies.filter(p => p.maternity_benefit > 0);
    if (!list.length) return replyMsg(token, { type: 'text', text: '您目前的保單沒有生育給付\n請洽業務員規劃' });
    const total = list.reduce((s,p) => s+p.maternity_benefit, 0);
    const flex = buildFlex('生育給付查詢', '#065f46', '👶',
      list.map(p => ({ label: p.company, sub: p.policy_name, value: `$${p.maternity_benefit.toLocaleString()}` })),
      '生育給付合計', `$${total.toLocaleString()} 元`, null
    );
    return replyMsg(token, [flex, { type: 'text', text: '恭喜即將迎接新生命！🎉\n如需申請理賠，請聯繫業務員協助',
      quickReply: quickReply([{label:'所有保單',text:'所有保單'},{label:'回主選單',text:'選單'}]) }]);
  }

  // 繳費時程
  if (txt.includes('繳費時程')||txt.includes('什麼時候繳')) {
    const list = policies.filter(p => p.due_date && p.annual_premium > 0).sort((a,b) => a.due_date.localeCompare(b.due_date));
    if (!list.length) return replyMsg(token, { type: 'text', text: '繳費資料尚未建立\n請洽業務員更新' });
    const total = list.reduce((s,p) => s+p.annual_premium, 0);
    const flex = buildFlex('年度繳費時程', '#1e3a5f', '📅',
      list.map(p => ({ label: `${p.due_date} · ${p.company}`, sub: p.policy_name, value: `$${p.annual_premium.toLocaleString()}` })),
      '年繳總保費', `$${total.toLocaleString()} 元`, `每月約 $${Math.round(total/12).toLocaleString()} 元`
    );
    return replyMsg(token, [flex, { type: 'text', text: '如有任何問題，請聯繫您的業務員 💪',
      quickReply: quickReply([{label:'所有保單',text:'所有保單'},{label:'回主選單',text:'選單'}]) }]);
  }

  // 保費查詢
  if (txt.includes('保費查詢')||txt.includes('保費')) {
    const list = policies.filter(p => p.annual_premium > 0);
    if (!list.length) return replyMsg(token, { type: 'text', text: '保費資料尚未建立\n請洽業務員更新' });
    const total = list.reduce((s,p) => s+p.annual_premium, 0);
    const flex = buildFlex('年繳保費明細', '#1e293b', '💰',
      list.map(p => ({ label: p.company, sub: `${p.policy_name} · ${p.pay_years||''}`, value: `$${p.annual_premium.toLocaleString()}` })),
      '年繳合計', `$${total.toLocaleString()} 元`, `每月平均 $${Math.round(total/12).toLocaleString()} 元`
    );
    return replyMsg(token, [flex, { type: 'text', text: '保費規劃如有疑問，請聯繫業務員 💪',
      quickReply: quickReply([{label:'繳費時程',text:'繳費時程'},{label:'回主選單',text:'選單'}]) }]);
  }

  // 所有保單
  if (txt.includes('所有保單')||txt.includes('保單清單')) {
    if (!policies.length) return replyMsg(token, { type: 'text', text: '您目前尚無保單資料',
      quickReply: quickReply([{label:'回主選單',text:'選單'}]) });
    const flex = buildFlex(`所有保單（共${policies.length}張）`, '#0f1f3d', '📋',
      policies.map(p => ({ label: p.company + ' · ' + p.type, sub: p.policy_name, value: p.daily_benefit ? `$${p.daily_benefit.toLocaleString()}/天` : p.lump_sum ? `${p.lump_sum}萬` : '—' })),
      null, null, null
    );
    return replyMsg(token, [flex, { type: 'text', text: `您共有 ${policies.length} 張有效保單 📋`,
      quickReply: quickReply([{label:'住院日額',text:'住院日額'},{label:'繳費時程',text:'繳費時程'},{label:'回主選單',text:'選單'}]) }]);
  }

  // 保單健診
  if (txt.includes('保單健診')||txt.includes('健診')) {
    const totalDaily = policies.reduce((s,p) => s+p.daily_benefit, 0);
    const totalLump = policies.reduce((s,p) => s+(p.lump_sum||0), 0);
    const totalCritical = policies.reduce((s,p) => s+(p.critical_illness||0), 0);
    const totalLife = policies.reduce((s,p) => s+(p.life_insurance||0), 0);
    const totalLtc = policies.reduce((s,p) => s+(p.ltc_monthly||0), 0);
    const totalAccDeath = policies.reduce((s,p) => s+(p.accident_death||0), 0);
    const totalSurgery = policies.reduce((s,p) => s+(p.surgery_benefit||0), 0);
    const totalInpatient = policies.reduce((s,p) => s+(p.inpatient_benefit||0), 0);
    const totalFracture = policies.reduce((s,p) => s+(p.fracture_benefit||0), 0);
    const totalAccident = policies.reduce((s,p) => s+(p.accident_outpatient||0), 0);
    const totalDisability = policies.reduce((s,p) => s+(p.disability_benefit||0), 0);
    const hasMaternity = policies.some(p => p.maternity_benefit > 0);
    const hasDisability = policies.some(p => p.type==='失能險');
    
    // 先傳送處理中訊息
    await replyMsg(token, { type: 'text', text: '🐾 保寶正在生成您的保障分析圖片...\n請稍候片刻！' });
    
    // 呼叫圖片生成API
    try {
      let age = '未填';
      const clientFull = await sb(`clients?id=eq.${user.client_id}&select=*`);
      if (clientFull[0]?.birthdate) {
        const bd = new Date(clientFull[0].birthdate);
        age = Math.floor((new Date()-bd)/(365.25*24*3600*1000)) + '歲';
      }
      
      const imgData = {
        name, age,
        daily: totalDaily, surgeryFixed: totalSurgery,
        inpatient: totalInpatient, fracture: totalFracture,
        accident: totalAccident, accDeath: totalAccDeath,
        disability: totalDisability, critical: totalCritical,
        cancer: totalLump, ltc: totalLtc, life: totalLife
      };
      
      const imgUrl = await generateImage(imgData);
      
      // 用push message傳圖片（因為reply token已用掉）
      await pushMsg(uid, [
        { type: 'image', originalContentUrl: imgUrl, previewImageUrl: imgUrl },
        { type: 'text', text: '以上是您的醫療雙十字保障分析 🏥\n如需調整保障，請聯繫您的業務員 💪',
          quickReply: quickReply([{label:'所有保單',text:'所有保單'},{label:'回主選單',text:'選單'}]) }
      ]);
      return;
    } catch(imgErr) {
      console.error('Image generation failed:', imgErr.message);
      // 如果圖片生成失敗，用文字版備援
    }
    
    const hasDisability2 = hasDisability;

    let score = 0;
    if (totalDaily >= 3000) score += 25; else if (totalDaily >= 1500) score += 15; else if (totalDaily > 0) score += 5;
    if (totalLump >= 100 || totalCritical >= 100) score += 25; else if (totalLump >= 50 || totalCritical >= 50) score += 15; else if (totalLump > 0 || totalCritical > 0) score += 5;
    if (totalLife >= 500) score += 20; else if (totalLife > 0) score += 10;
    if (totalLtc > 0) score += 15;
    if (hasDisability) score += 15;

    const grade = score >= 80 ? '優秀 🏆' : score >= 60 ? '良好 👍' : score >= 40 ? '普通 📊' : '需加強 ⚠️';

    const flex = {
      type: 'flex', altText: '保單健診報告',
      contents: {
        type: 'bubble', size: 'giga',
        header: { type: 'box', layout: 'vertical', backgroundColor: '#0f1f3d', paddingAll: '14px',
          contents: [{ type: 'text', text: '🔍 保單健診報告', color: '#ffffff', weight: 'bold', size: 'lg' }]
        },
        body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
          contents: [
            { type: 'box', layout: 'vertical', backgroundColor: '#f0f9ff', cornerRadius: '12px', paddingAll: '14px',
              contents: [
                { type: 'text', text: `${score}分`, size: 'xxl', weight: 'bold', color: '#1a56db', align: 'center' },
                { type: 'text', text: grade, size: 'lg', align: 'center', margin: 'xs' }
              ]
            },
            { type: 'separator', margin: 'sm' },
            flexRow('🏥 住院日額', totalDaily ? `$${totalDaily.toLocaleString()}/天` : '無', totalDaily >= 3000 ? '#10b981' : '#ef4444'),
            { type: 'separator', margin: 'sm' },
            flexRow('🎗️ 癌症/重病', (totalLump||totalCritical) ? `${totalLump+totalCritical}萬` : '未投保', (totalLump+totalCritical) >= 100 ? '#10b981' : '#ef4444'),
            { type: 'separator', margin: 'sm' },
            flexRow('💜 壽險保額', totalLife ? `${totalLife}萬` : '未投保', totalLife >= 500 ? '#10b981' : '#ef4444'),
            { type: 'separator', margin: 'sm' },
            flexRow('👴 長照規劃', totalLtc ? `$${totalLtc.toLocaleString()}/月` : '未投保', totalLtc ? '#10b981' : '#ef4444'),
            { type: 'separator', margin: 'sm' },
            flexRow('♿ 失能規劃', hasDisability ? '已投保' : '未投保', hasDisability ? '#10b981' : '#ef4444'),
            { type: 'separator', margin: 'sm' },
            flexRow('👶 生育給付', hasMaternity ? '有' : '未投保', hasMaternity ? '#10b981' : '#94a3b8'),
            { type: 'separator', margin: 'sm' },
            { type: 'box', layout: 'vertical', backgroundColor: score < 60 ? '#fee2e2' : '#d1fae5', cornerRadius: '8px', paddingAll: '12px',
              contents: [
                { type: 'text', text: score < 60 ? '⚠️ 建議加強保障' : '✅ 保障規劃良好', size: 'sm', weight: 'bold', color: score < 60 ? '#991b1b' : '#065f46' },
                { type: 'text', text: score < 60 ? '請聯繫業務員進行保障規劃分析' : '如有需要可聯繫業務員進行調整', size: 'xs', color: '#475569', margin: 'xs', wrap: true }
              ]
            }
          ]
        }
      }
    };
    return replyMsg(token, [flex, { type: 'text', text: '需要詳細保單健診分析嗎？\n請聯繫您的業務員 😊',
      quickReply: quickReply([{label:'所有保單',text:'所有保單'},{label:'回主選單',text:'選單'}]) }]);
  }

  // 預設 → 主選單
  return replyMsg(token, mainMenu(name));
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`PolicyPal running on port ${PORT}`));

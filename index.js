const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bayjzxyacueqinjheljy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJheWp6eHlhY3VlcWluamhlbGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjYwNDEsImV4cCI6MjA5NDk0MjA0MX0.ZVvhMOkv5yA22z3nU84JzfLPt5dQkd2olHCj2jkLc_s';
const LINE_SECRET = process.env.LINE_CHANNEL_SECRET || '1df0ef046c91ae10c044418b6a537093';
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || 'ssl5lO057bLYBVdlqMwxNohdHHEjoJiUy9XM+ovP43Fb5ZruJmZCSqOZngje0wMhpH87GqJfk5NfZh5tfzgo3OD/kqUqxuCOC5h2oyYVAIrXZxJfcm+K6EdJiAzwpc7HCAHt3o55V8u3ozysbgIZlgdB04t89/1O/w1cDnyilFU=';

const config = { channelSecret: LINE_SECRET, channelAccessToken: LINE_TOKEN };
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const client = new line.Client(config);

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;
  const userId = event.source.userId;
  const text = event.message.text.trim();

  const { data: user } = await supabase
    .from('users').select('*').eq('line_uid', userId).single();

  if (!user) {
    if (/^09\d{8}$/.test(text)) {
      const { data: clientData } = await supabase
        .from('clients').select('*').eq('phone', text).single();
      if (!clientData) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 查無此手機號碼\n請確認號碼或聯繫您的業務員。'
        });
      }
      await supabase.from('users').insert({ line_uid: userId, client_id: clientData.id, phone: text });
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `✅ 綁定成功！\n\n嗨，${clientData.name}！歡迎使用 PolicyPal 保單夥伴 🛡️\n\n您可以查詢：\n🏥 住院日額\n🔪 開刀手術\n🎗️ 確診癌症\n👶 生育給付\n📋 所有保單\n📅 繳費時程`
      });
    }
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '👋 歡迎使用 PolicyPal 保單夥伴！\n\n請輸入您的手機號碼查看保單\n（格式：0912345678）'
    });
  }

  const { data: policies } = await supabase
    .from('policies').select('*').eq('client_id', user.client_id);
  const { data: clientInfo } = await supabase
    .from('clients').select('name').eq('id', user.client_id).single();

  return client.replyMessage(event.replyToken, buildReply(text, policies, clientInfo?.name));
}

function buildReply(text, policies, name) {
  if (text.includes('住院') || text.includes('日額')) {
    const list = policies.filter(p => p.daily_benefit > 0);
    if (!list.length) return { type: 'text', text: '您目前沒有住院日額保單。\n請洽業務員加強保障 😊' };
    const total = list.reduce((s, p) => s + p.daily_benefit, 0);
    return buildFlex('🏥 住院日額試算',
      list.map(p => ({ label: p.company, sub: p.policy_name, value: `$${p.daily_benefit.toLocaleString()}/天` })),
      `每日合計：$${total.toLocaleString()} 元`,
      `住院7天可獲得 $${(total*7).toLocaleString()} 元`);
  }
  if (text.includes('開刀') || text.includes('手術')) {
    const dList = policies.filter(p => p.daily_benefit > 0);
    const sList = policies.filter(p => p.surgery_benefit > 0);
    if (!dList.length && !sList.length) return { type: 'text', text: '您目前沒有手術相關保障。\n建議洽業務員評估！' };
    const tD = dList.reduce((s, p) => s + p.daily_benefit, 0);
    const tS = sList.reduce((s, p) => s + p.surgery_benefit, 0);
    const items = [
      ...sList.map(p => ({ label: p.company, sub: `${p.policy_name}・手術給付`, value: `$${p.surgery_benefit.toLocaleString()}` })),
      ...(tD ? [{ label: '住院日額（7天）', sub: '各保單合計', value: `$${(tD*7).toLocaleString()}` }] : [])
    ];
    return buildFlex('🔪 手術住院試算', items, `預估合計：$${(tS+tD*7).toLocaleString()} 元`, '⚠️ 實際理賠依保單條款為準');
  }
  if (text.includes('癌症') || text.includes('罹癌')) {
    const list = policies.filter(p => p.type === '癌症險' || p.type === '重大疾病險');
    if (!list.length) return { type: 'text', text: '您目前沒有癌症險。\n強烈建議洽業務員加強！🎗️' };
    const total = list.reduce((s, p) => s + (p.lump_sum || 0) * 10000, 0);
    return buildFlex('🎗️ 癌症保障試算',
      list.map(p => ({ label: p.company, sub: `${p.policy_name}・${p.type}`, value: p.lump_sum ? `${p.lump_sum}萬` : '—' })),
      `一次給付合計：$${total.toLocaleString()} 元`, '⚠️ 實際理賠依保單條款為準');
  }
  if (text.includes('生小孩') || text.includes('生育') || text.includes('懷孕')) {
    const list = policies.filter(p => p.maternity_benefit > 0);
    if (!list.length) return { type: 'text', text: '您目前的保單沒有生育給付。\n請洽業務員確認！👶' };
    const total = list.reduce((s, p) => s + p.maternity_benefit, 0);
    return buildFlex('👶 生育給付',
      list.map(p => ({ label: p.company, sub: p.policy_name, value: `$${p.maternity_benefit.toLocaleString()}` })),
      `生育給付合計：$${total.toLocaleString()} 元`, '恭喜即將迎接新生命！🎉');
  }
  if (text.includes('繳費') || text.includes('什麼時候')) {
    const list = policies.filter(p => p.due_date && p.annual_premium > 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    if (!list.length) return { type: 'text', text: '繳費資料尚未建立，請洽業務員更新。' };
    const total = list.reduce((s, p) => s + p.annual_premium, 0);
    return buildFlex('📅 繳費時程',
      list.map(p => ({ label: `${p.due_date} · ${p.company}`, sub: p.policy_name, value: `$${p.annual_premium.toLocaleString()}` })),
      `年繳總保費：$${total.toLocaleString()} 元`, `每月約 $${Math.round(total/12).toLocaleString()} 元`);
  }
  if (text.includes('所有') || text.includes('清單') || text.includes('保單')) {
    if (!policies.length) return { type: 'text', text: '您目前尚無保單資料。' };
    return buildFlex(`📋 所有保單（共${policies.length}張）`,
      policies.map(p => ({ label: p.policy_name, sub: `${p.company}・${p.type}`, value: p.daily_benefit ? `$${p.daily_benefit.toLocaleString()}/天` : p.lump_sum ? `${p.lump_sum}萬` : '—' })),
      '', '');
  }
  return { type: 'text', text: `嗨，${name}！👋\n\nPolicyPal 可以幫您查詢：\n\n🏥 住院日額\n🔪 開刀手術\n🎗️ 確診癌症\n👶 生育給付\n📋 所有保單\n📅 繳費時程\n\n請直接輸入關鍵字！` };
}

function buildFlex(title, items, total, note) {
  return {
    type: 'flex', altText: title,
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: '#0f1f3d', paddingAll: '14px',
        contents: [{ type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'md' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        ...items.map(item => ({
          type: 'box', layout: 'horizontal', backgroundColor: '#f8fafc', cornerRadius: '8px', paddingAll: '10px',
          contents: [
            { type: 'box', layout: 'vertical', flex: 3, contents: [
              { type: 'text', text: item.label, size: 'sm', weight: 'bold', color: '#1e293b' },
              { type: 'text', text: item.sub, size: 'xs', color: '#94a3b8', wrap: true }
            ]},
            { type: 'text', text: item.value, size: 'sm', weight: 'bold', color: '#1a56db', align: 'end', flex: 2 }
          ]
        })),
        ...(total ? [{ type: 'box', layout: 'horizontal', backgroundColor: '#e0f2fe', cornerRadius: '8px', paddingAll: '10px', margin: 'sm',
          contents: [{ type: 'text', text: total, size: 'sm', weight: 'bold', color: '#1a56db' }] }] : []),
        ...(note ? [{ type: 'text', text: note, size: 'xs', color: '#94a3b8', margin: 'sm', wrap: true }] : [])
      ]}
    }
  };
}

app.get('/', (req, res) => res.send('PolicyPal Bot is running! 🛡️'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PolicyPal running on port ${PORT}`));

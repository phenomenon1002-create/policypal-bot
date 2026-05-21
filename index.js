const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ── 設定 ──
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
const client = new line.Client(config);

// ── Webhook ──
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// ── 處理訊息 ──
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;
  const userId = event.source.userId;
  const text = event.message.text.trim();

  // 查詢用戶是否已綁定
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('line_uid', userId)
    .single();

  // 未綁定 → 要求輸入手機號碼
  if (!user) {
    if (/^09\d{8}$/.test(text)) {
      // 嘗試綁定
      const { data: client_data } = await supabase
        .from('clients')
        .select('*')
        .eq('phone', text)
        .single();

      if (!client_data) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '❌ 查無此手機號碼\n\n請確認號碼是否正確，或聯繫您的業務員新增資料。'
        });
      }

      // 綁定成功
      await supabase.from('users').insert({
        line_uid: userId,
        client_id: client_data.id,
        phone: text
      });

      return client.replyMessage(event.replyToken, buildWelcomeMessage(client_data.name));
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '👋 歡迎使用 PolicyPal 保單夥伴！\n\n請輸入您的手機號碼以查看保單\n（格式：0912345678）'
    });
  }

  // 已綁定 → 查詢保單
  const { data: policies } = await supabase
    .from('policies')
    .select('*')
    .eq('client_id', user.client_id);

  const { data: clientInfo } = await supabase
    .from('clients')
    .select('name')
    .eq('id', user.client_id)
    .single();

  return client.replyMessage(event.replyToken, await buildReply(text, policies, clientInfo?.name));
}

// ── 回覆邏輯 ──
async function buildReply(text, policies, name) {
  // 住院日額
  if (text.includes('住院') || text.includes('日額')) {
    const list = policies.filter(p => p.daily_benefit > 0);
    if (!list.length) return { type: 'text', text: '您目前沒有住院日額保單。\n請洽業務員加強保障 😊' };
    const total = list.reduce((s, p) => s + p.daily_benefit, 0);
    return buildFlexCard('🏥 住院日額試算', list.map(p => ({
      label: p.company,
      sub: p.policy_name,
      value: `$${p.daily_benefit.toLocaleString()}/天`
    })), `每日合計：$${total.toLocaleString()} 元`, `住院7天可獲得 $${(total*7).toLocaleString()} 元`);
  }

  // 開刀
  if (text.includes('開刀') || text.includes('手術')) {
    const dailyList = policies.filter(p => p.daily_benefit > 0);
    const surgList = policies.filter(p => p.surgery_benefit > 0);
    if (!dailyList.length && !surgList.length) return { type: 'text', text: '您目前沒有手術相關保障。\n建議洽業務員評估！' };
    const totalDaily = dailyList.reduce((s, p) => s + p.daily_benefit, 0);
    const totalSurg = surgList.reduce((s, p) => s + p.surgery_benefit, 0);
    const items = [
      ...surgList.map(p => ({ label: p.company, sub: `${p.policy_name}・手術給付`, value: `$${p.surgery_benefit.toLocaleString()}` })),
      ...(totalDaily ? [{ label: '住院日額（7天）', sub: '各保單合計', value: `$${(totalDaily*7).toLocaleString()}` }] : [])
    ];
    return buildFlexCard('🔪 手術住院試算', items, `預估合計：$${(totalSurg + totalDaily*7).toLocaleString()} 元`, '⚠️ 實際理賠依保單條款為準');
  }

  // 癌症
  if (text.includes('癌症') || text.includes('罹癌')) {
    const list = policies.filter(p => p.type === '癌症險' || p.type === '重大疾病險');
    if (!list.length) return { type: 'text', text: '您目前沒有癌症險或重大疾病險。\n強烈建議洽業務員加強！🎗️' };
    const total = list.reduce((s, p) => s + (p.lump_sum || 0) * 10000, 0);
    return buildFlexCard('🎗️ 癌症保障試算', list.map(p => ({
      label: p.company,
      sub: `${p.policy_name}・${p.type}`,
      value: p.lump_sum ? `${p.lump_sum}萬` : '—'
    })), `一次給付合計：$${total.toLocaleString()} 元`, '⚠️ 實際理賠依保單條款為準');
  }

  // 生育
  if (text.includes('生小孩') || text.includes('生育') || text.includes('懷孕')) {
    const list = policies.filter(p => p.maternity_benefit > 0);
    if (!list.length) return { type: 'text', text: '您目前的保單沒有生育給付。\n部分醫療險含生產住院補貼，請洽業務員確認！👶' };
    const total = list.reduce((s, p) => s + p.maternity_benefit, 0);
    return buildFlexCard('👶 生育給付', list.map(p => ({
      label: p.company,
      sub: p.policy_name,
      value: `$${p.maternity_benefit.toLocaleString()}`
    })), `生育給付合計：$${total.toLocaleString()} 元`, '恭喜即將迎接新生命！🎉');
  }

  // 繳費提醒
  if (text.includes('繳費') || text.includes('什麼時候')) {
    const list = policies.filter(p => p.due_date && p.annual_premium > 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    if (!list.length) return { type: 'text', text: '繳費資料尚未建立，請洽業務員更新。' };
    const total = list.reduce((s, p) => s + p.annual_premium, 0);
    return buildFlexCard('📅 繳費時程', list.map(p => ({
      label: `${p.due_date} · ${p.company}`,
      sub: p.policy_name,
      value: `$${p.annual_premium.toLocaleString()}`
    })), `年繳總保費：$${total.toLocaleString()} 元`, `每月約 $${Math.round(total/12).toLocaleString()} 元`);
  }

  // 所有保單
  if (text.includes('所有') || text.includes('清單') || text.includes('保單')) {
    if (!policies.length) return { type: 'text', text: '您目前尚無保單資料。' };
    return buildFlexCard(`📋 所有保單（共${policies.length}張）`, policies.map(p => ({
      label: p.policy_name,
      sub: `${p.company}・${p.type}`,
      value: p.daily_benefit ? `$${p.daily_benefit.toLocaleString()}/天` : p.lump_sum ? `${p.lump_sum}萬` : '—'
    })), '', '');
  }

  // 預設選單
  return {
    type: 'text',
    text: `嗨，${name}！👋\n\nPolicyPal 可以幫您查詢：\n\n🏥 住院日額\n🔪 開刀手術\n🎗️ 確診癌症\n👶 生育給付\n📋 所有保單\n📅 繳費時程\n\n請直接輸入關鍵字查詢！`
  };
}

// ── Flex Message 卡片 ──
function buildFlexCard(title, items, total, note) {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: title,
          color: '#ffffff',
          weight: 'bold',
          size: 'md'
        }],
        backgroundColor: '#0f1f3d',
        paddingAll: '14px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...items.map(item => ({
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                flex: 3,
                contents: [
                  { type: 'text', text: item.label, size: 'sm', weight: 'bold', color: '#1e293b' },
                  { type: 'text', text: item.sub, size: 'xs', color: '#94a3b8', wrap: true }
                ]
              },
              { type: 'text', text: item.value, size: 'sm', weight: 'bold', color: '#1a56db', align: 'end', flex: 2 }
            ],
            backgroundColor: '#f8fafc',
            cornerRadius: '8px',
            paddingAll: '10px'
          })),
          ...(total ? [{
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: total, size: 'sm', weight: 'bold', color: '#1a56db', flex: 1 }
            ],
            backgroundColor: '#e0f2fe',
            cornerRadius: '8px',
            paddingAll: '10px',
            margin: 'sm'
          }] : []),
          ...(note ? [{
            type: 'text',
            text: note,
            size: 'xs',
            color: '#94a3b8',
            margin: 'sm',
            wrap: true
          }] : [])
        ]
      }
    }
  };
}

function buildWelcomeMessage(name) {
  return {
    type: 'text',
    text: `✅ 綁定成功！\n\n嗨，${name}！歡迎使用 PolicyPal 保單夥伴 🛡️\n\n您可以查詢：\n🏥 住院日額\n🔪 開刀手術\n🎗️ 確診癌症\n👶 生育給付\n📋 所有保單\n📅 繳費時程`
  };
}

app.get('/', (req, res) => res.send('PolicyPal Bot is running! 🛡️'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PolicyPal running on port ${PORT}`));

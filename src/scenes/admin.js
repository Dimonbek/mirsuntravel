const { Scenes, Markup } = require('telegraf');
const fs = require('fs');
const { dbApi } = require('../database');
const { getAllKeys, getDefault } = require('../locales');
const report = require('../report');

const ADMIN_SCENE = 'admin';

// ============ KEYBOARDS ============
function mainMenuKb(isSuper) {
  const rows = [
    [Markup.button.callback('📊 Statistika', 'a:stats'), Markup.button.callback('📥 Eksport (Excel)', 'a:export')],
    [Markup.button.callback('📅 Oylik hisobotni guruhga yuborish', 'a:monthly')],
    [Markup.button.callback('📢 Broadcast', 'a:broadcast'), Markup.button.callback('✏️ Matnlar', 'a:texts')],
    [Markup.button.callback("🕐 Bog'lanish vaqtlari", 'a:times')],
    [Markup.button.callback('🚫 Bloklangan foydalanuvchilar', 'a:blocked')],
  ];
  if (isSuper) {
    rows.push([Markup.button.callback('👥 Adminlar', 'a:admins')]);
  }
  rows.push([Markup.button.callback('⚙️ Sozlamalar', 'a:settings')]);
  rows.push([Markup.button.callback('❌ Chiqish', 'a:exit')]);
  return Markup.inlineKeyboard(rows);
}

function backKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Asosiy menyu', 'a:main')]
  ]);
}

function cancelKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Bekor qilish', 'a:cancel')]
  ]);
}

function timesKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ Qo'shish", 'a:time_add'), Markup.button.callback("➖ O'chirish", 'a:time_del')],
    [Markup.button.callback('⬅️ Asosiy menyu', 'a:main')]
  ]);
}

function blockedKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🚫 Bloklash', 'a:block'), Markup.button.callback('✅ Chiqarish', 'a:unblock')],
    [Markup.button.callback('⬅️ Asosiy menyu', 'a:main')]
  ]);
}

function adminsKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ Qo'shish", 'a:admin_add'), Markup.button.callback("➖ O'chirish", 'a:admin_del')],
    [Markup.button.callback('⬅️ Asosiy menyu', 'a:main')]
  ]);
}

function settingsKb() {
  const active = dbApi.getSetting('bot_active') === '1';
  return Markup.inlineKeyboard([
    [Markup.button.callback(active ? "🔴 Botni o'chirish" : '🟢 Botni yoqish', 'a:toggle_bot')],
    [Markup.button.callback("🆔 Guruh ID o'zgartirish", 'a:set_group')],
    [Markup.button.callback('📡 Guruhga test xabar', 'a:test_group')],
    [Markup.button.callback('⬅️ Asosiy menyu', 'a:main')]
  ]);
}

function textsLangKb() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🇺🇿 O'zbek", 'a:txt_uz'), Markup.button.callback('🇷🇺 Русский', 'a:txt_ru')],
    [Markup.button.callback('⬅️ Asosiy menyu', 'a:main')]
  ]);
}

function textKeysKb(lang) {
  const keys = getAllKeys();
  const rows = [];
  for (let i = 0; i < keys.length; i += 2) {
    const row = [Markup.button.callback(keys[i], `a:txtk:${lang}:${i}`)];
    if (keys[i + 1]) row.push(Markup.button.callback(keys[i + 1], `a:txtk:${lang}:${i + 1}`));
    rows.push(row);
  }
  rows.push([Markup.button.callback('⬅️ Ortga', 'a:texts')]);
  return Markup.inlineKeyboard(rows);
}

function editTextKb(lang, idx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("♻️ Default qilish", `a:txtr:${lang}:${idx}`)],
    [Markup.button.callback('⬅️ Ortga', `a:txt_${lang}`)]
  ]);
}

// ============ SCENE ============
const admin = new Scenes.BaseScene(ADMIN_SCENE);

admin.enter(async (ctx) => {
  if (!dbApi.isAdmin(ctx.from.id)) {
    await ctx.reply("❌ Sizda admin huquqlari yo'q.");
    return ctx.scene.leave();
  }
  const isSuper = dbApi.isSuperAdmin(ctx.from.id);
  const text = `👋 Admin panel${isSuper ? ' (Super Admin)' : ''}\n\nKerakli bo'limni tanlang:`;
  await ctx.reply(text, mainMenuKb(isSuper));
});

// ============ HELPER ============
async function editOrReply(ctx, text, kb) {
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
  }
}

// ============ MAIN MENU ============
admin.action('a:main', async (ctx) => {
  await ctx.answerCbQuery();
  const isSuper = dbApi.isSuperAdmin(ctx.from.id);
  ctx.session.adminAction = null;
  await editOrReply(ctx, `👋 Admin panel${isSuper ? ' (Super Admin)' : ''}\n\nKerakli bo'limni tanlang:`, mainMenuKb(isSuper));
});

// ============ CHIQISH ============
admin.action('a:exit', async (ctx) => {
  await ctx.answerCbQuery('Chiqildi');
  try { await ctx.editMessageText('Admin paneldan chiqdingiz.'); } catch (e) {}
  return ctx.scene.leave();
});

// ============ CANCEL ============
admin.action('a:cancel', async (ctx) => {
  await ctx.answerCbQuery('Bekor qilindi');
  ctx.session.adminAction = null;
  const isSuper = dbApi.isSuperAdmin(ctx.from.id);
  try { await ctx.editMessageText('Bekor qilindi.'); } catch (e) {}
  await ctx.reply('Asosiy menyu:', mainMenuKb(isSuper));
});

// ============ STATISTIKA ============
admin.action('a:stats', async (ctx) => {
  await ctx.answerCbQuery();
  const s = dbApi.getStats();
  let msg = `📊 *STATISTIKA*\n\n`;
  msg += `📋 Jami so'rovlar: *${s.total}*\n`;
  msg += `📅 Bugun: *${s.today}*\n`;
  msg += `📆 So'nggi 7 kun: *${s.week}*\n`;
  msg += `🗓 Shu oy: *${s.month}*\n\n`;
  msg += `👥 Jami foydalanuvchilar: *${s.totalUsers}*\n`;
  msg += `🚫 Bloklanganlar: *${s.blockedUsers}*\n\n`;

  if (s.services && s.services.length) {
    msg += `🧾 *Xizmat turlari:*\n`;
    s.services.forEach(x => { msg += `• ${report.serviceLabel(x.service_type)} — ${x.c}\n`; });
    msg += '\n';
  }
  if (s.destinations.length) {
    msg += `🌍 *Top yo'nalishlar:*\n`;
    s.destinations.forEach((d, i) => { msg += `${i + 1}. ${d.destination} — ${d.c}\n`; });
    msg += '\n';
  }
  if (s.stars.length) {
    msg += `🏨 *Mehmonxona yulduzi:*\n`;
    s.stars.forEach(x => { msg += `• ${x.hotel_stars}⭐ — ${x.c}\n`; });
    msg += '\n';
  }
  if (s.payments.length) {
    msg += `💳 *To'lov turi:*\n`;
    s.payments.forEach(p => { msg += `• ${report.paymentLabel(p.payment_type)} — ${p.c}\n`; });
    msg += '\n';
  }
  if (s.times.length) {
    msg += `🕐 *Bog'lanish vaqtlari:*\n`;
    s.times.forEach(x => { msg += `• ${x.contact_time}: ${x.c}\n`; });
    msg += '\n';
  }
  if (s.languages.length) {
    msg += `🌐 *Tillar:*\n`;
    s.languages.forEach(l => { msg += `• ${l.language}: ${l.c}\n`; });
    msg += '\n';
  }
  if (s.managers.length) {
    msg += `👨‍💼 *Menejerlar:*\n`;
    s.managers.forEach(m => { msg += `• ${m.manager}: ${m.c}\n`; });
    msg += '\n';
  }
  if (s.campaigns.length) {
    msg += `📣 *Reklama kampaniyalari:*\n`;
    s.campaigns.forEach(c => { msg += `• ${c.campaign_code}: ${c.c}\n`; });
  }
  await editOrReply(ctx, msg, backKb());
});

// ============ EKSPORT ============
admin.action('a:export', async (ctx) => {
  await ctx.answerCbQuery('Tayyorlanmoqda...');
  const surveys = dbApi.getAllSurveys();
  if (!surveys.length) {
    return editOrReply(ctx, "❌ Hali so'rovlar yo'q.", backKb());
  }
  // Ustunlar hisobotdagi bekap bilan bir xil — report.buildExcel dan foydalanamiz
  const filePath = await report.buildExcel(surveys, `surveys_${Date.now()}.xlsx`);
  await ctx.replyWithDocument({ source: filePath, filename: 'surveys.xlsx' });
  setTimeout(() => { try { fs.unlinkSync(filePath); } catch (e) {} }, 5000);
  await ctx.reply('✅ Eksport tayyor.', backKb());
});

// ============ OYLIK HISOBOT (qo'lda) ============
admin.action('a:monthly', async (ctx) => {
  await ctx.answerCbQuery('Tayyorlanmoqda...');
  const range = report.previousMonth(dbApi.tashkentNow());
  try {
    const ok = await report.sendMonthlyReport(ctx.telegram, range);
    if (!ok) {
      return editOrReply(ctx, "❌ Guruh ID sozlanmagan.", backKb());
    }
    await editOrReply(ctx, '✅ ' + range.label + ' hisoboti guruhga yuborildi.', backKb());
  } catch (e) {
    console.error('Qo\'lda hisobot xato:', e.message);
    await editOrReply(ctx, '❌ Xato: ' + e.message, backKb());
  }
});

// ============ BROADCAST ============
admin.action('a:broadcast', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminAction = 'broadcast';
  await editOrReply(ctx, "📢 Yubormoqchi bo'lgan xabaringizni yozing:", cancelKb());
});

// ============ MATN TAHRIRLASH ============
admin.action('a:texts', async (ctx) => {
  await ctx.answerCbQuery();
  await editOrReply(ctx, '✏️ Qaysi tildagi matnni tahrirlaysiz?', textsLangKb());
});

admin.action(/^a:txt_(uz|ru)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const lang = ctx.match[1];
  await editOrReply(ctx, `Tahrirlash uchun kalit tanlang (${lang}):`, textKeysKb(lang));
});

admin.action(/^a:txtk:(uz|ru):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const lang = ctx.match[1];
  const idx = parseInt(ctx.match[2]);
  const keys = getAllKeys();
  const key = keys[idx];
  if (!key) return;
  const current = dbApi.getTextOverride(lang, key) || getDefault(lang, key);
  ctx.session.adminAction = `edit_text:${lang}:${key}`;
  await editOrReply(ctx, `*Kalit:* \`${key}\`\n\n*Joriy matn:*\n${current}\n\nYangi matnni yuboring:`, editTextKb(lang, idx));
});

admin.action(/^a:txtr:(uz|ru):(\d+)$/, async (ctx) => {
  const lang = ctx.match[1];
  const idx = parseInt(ctx.match[2]);
  const keys = getAllKeys();
  const key = keys[idx];
  if (!key) return ctx.answerCbQuery();
  dbApi.resetTextOverride(lang, key);
  await ctx.answerCbQuery('✅ Default qaytarildi');
  ctx.session.adminAction = null;
  await editOrReply(ctx, `Tahrirlash uchun kalit tanlang (${lang}):`, textKeysKb(lang));
});

// ============ VAQTLAR ============
admin.action('a:times', async (ctx) => {
  await ctx.answerCbQuery();
  await showTimes(ctx);
});

async function showTimes(ctx) {
  const times = dbApi.getContactTimes();
  let msg = "🕐 *Bog'lanish vaqtlari:*\n\n";
  if (!times.length) msg += "_Hech qanday vaqt yo'q._\n";
  times.forEach((t, i) => { msg += `${i + 1}. ${t.label} _(ID: ${t.id})_\n`; });
  await editOrReply(ctx, msg, timesKb());
}

admin.action('a:time_add', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminAction = 'add_time';
  await editOrReply(ctx, "Yangi vaqt oralig'ini kiriting.\nMasalan: `09:00 - 10:00`", cancelKb());
});

admin.action('a:time_del', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminAction = 'remove_time';
  await editOrReply(ctx, "O'chirmoqchi bo'lgan vaqtning ID raqamini kiriting:", cancelKb());
});

// ============ BLOKLASH ============
admin.action('a:blocked', async (ctx) => {
  await ctx.answerCbQuery();
  await showBlocked(ctx);
});

async function showBlocked(ctx) {
  const blocked = dbApi.getBlockedUsers();
  let msg = '🚫 *Bloklangan foydalanuvchilar:*\n\n';
  if (!blocked.length) msg += "_Bloklangan yo'q._\n";
  blocked.forEach((u, i) => {
    const uname = u.username ? '@' + u.username : '';
    msg += `${i + 1}. ${u.first_name || ''} ${uname} — \`${u.telegram_id}\`\n`;
  });
  await editOrReply(ctx, msg, blockedKb());
}

admin.action('a:block', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminAction = 'block_user';
  await editOrReply(ctx, "Bloklamoqchi bo'lgan foydalanuvchining Telegram ID sini kiriting:", cancelKb());
});

admin.action('a:unblock', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminAction = 'unblock_user';
  await editOrReply(ctx, "Blokdan chiqarmoqchi bo'lgan foydalanuvchining ID sini kiriting:", cancelKb());
});

// ============ ADMINLAR (faqat Super) ============
admin.action('a:admins', async (ctx) => {
  await ctx.answerCbQuery();
  if (!dbApi.isSuperAdmin(ctx.from.id)) {
    return editOrReply(ctx, '❌ Faqat Super Admin uchun.', backKb());
  }
  await showAdmins(ctx);
});

async function showAdmins(ctx) {
  const admins = dbApi.getAdmins();
  let msg = '👥 *Adminlar ro\'yxati:*\n\n';
  admins.forEach((a, i) => {
    msg += `${i + 1}. \`${a.telegram_id}\` ${a.is_super ? '👑 Super Admin' : ''}\n`;
  });
  await editOrReply(ctx, msg, adminsKb());
}

admin.action('a:admin_add', async (ctx) => {
  await ctx.answerCbQuery();
  if (!dbApi.isSuperAdmin(ctx.from.id)) return;
  ctx.session.adminAction = 'add_admin';
  await editOrReply(ctx, "Yangi adminning Telegram ID sini kiriting:", cancelKb());
});

admin.action('a:admin_del', async (ctx) => {
  await ctx.answerCbQuery();
  if (!dbApi.isSuperAdmin(ctx.from.id)) return;
  ctx.session.adminAction = 'remove_admin';
  await editOrReply(ctx, "O'chirmoqchi bo'lgan adminning ID sini kiriting.\n_Super adminni o'chirib bo'lmaydi._", cancelKb());
});

// ============ SOZLAMALAR ============
admin.action('a:settings', async (ctx) => {
  await ctx.answerCbQuery();
  const active = dbApi.getSetting('bot_active') === '1';
  const groupId = dbApi.getSetting('group_id') || '—';
  let msg = '⚙️ *Sozlamalar:*\n\n';
  msg += `Bot holati: ${active ? '✅ Faol' : "❌ O'chirilgan"}\n`;
  msg += `Guruh ID: \`${groupId}\`\n`;
  await editOrReply(ctx, msg, settingsKb());
});

admin.action('a:toggle_bot', async (ctx) => {
  const current = dbApi.getSetting('bot_active') === '1';
  dbApi.setSetting('bot_active', current ? '0' : '1');
  await ctx.answerCbQuery(current ? '❌ Bot o\'chirildi' : '✅ Bot yoqildi');
  // Sozlamalar sahifasini yangilash
  const active = dbApi.getSetting('bot_active') === '1';
  const groupId = dbApi.getSetting('group_id') || '—';
  let msg = '⚙️ *Sozlamalar:*\n\n';
  msg += `Bot holati: ${active ? '✅ Faol' : "❌ O'chirilgan"}\n`;
  msg += `Guruh ID: \`${groupId}\`\n`;
  await editOrReply(ctx, msg, settingsKb());
});

admin.action('a:set_group', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminAction = 'set_group_id';
  await editOrReply(ctx, "Yangi guruh ID sini kiriting.\n_Masalan: -1001234567890_", cancelKb());
});

admin.action('a:test_group', async (ctx) => {
  await ctx.answerCbQuery('Yuborilmoqda...');
  const groupId = dbApi.getSetting('group_id') || process.env.GROUP_ID;
  if (!groupId) {
    return editOrReply(ctx, '❌ Guruh ID belgilanmagan!', settingsKb());
  }
  try {
    await ctx.telegram.sendMessage(groupId, '✅ Test xabar — bot guruh bilan bog\'langan.');
    await editOrReply(ctx, `✅ Guruhga muvaffaqiyatli yuborildi!\n\nGuruh ID: \`${groupId}\``, settingsKb());
  } catch (err) {
    let errMsg = `❌ *Guruhga yuborib bo'lmadi!*\n\n`;
    errMsg += `Guruh ID: \`${groupId}\`\n`;
    errMsg += `Xato: \`${err.message}\`\n\n`;
    errMsg += `*Sabablar:*\n`;
    errMsg += `1. Bot guruhga qo'shilmagan\n`;
    errMsg += `2. Bot adminlik huquqi yo'q\n`;
    errMsg += `3. Guruh ID noto'g'ri\n\n`;
    errMsg += `_Supergroup uchun ID \`-100\` bilan boshlanishi kerak._`;
    await editOrReply(ctx, errMsg, settingsKb());
  }
});

// ============ MATN HANDLER (action turlari) ============
admin.on('text', async (ctx) => {
  const action = ctx.session.adminAction;
  const text = ctx.message.text.trim();

  if (text === '/start' || text === '/admin' || text === '/til') return;
  if (!action) return;

  // BROADCAST
  if (action === 'broadcast') {
    ctx.session.adminAction = null;
    const userIds = dbApi.getAllUserIds();
    await ctx.reply(`📤 ${userIds.length} foydalanuvchiga yuborilmoqda...`);
    let success = 0, failed = 0;
    for (const id of userIds) {
      try { await ctx.telegram.sendMessage(id, text); success++; } catch (e) { failed++; }
      await new Promise(r => setTimeout(r, 50));
    }
    return ctx.reply(`✅ Yuborildi: ${success}\n❌ Xato: ${failed}`, backKb());
  }

  // EDIT TEXT
  if (action.startsWith('edit_text:')) {
    const [, lang, key] = action.split(':');
    dbApi.setTextOverride(lang, key, text);
    ctx.session.adminAction = null;
    return ctx.reply(`✅ Saqlandi (\`${key}\` / ${lang}).`, { parse_mode: 'Markdown', ...backKb() });
  }

  // ADD TIME
  if (action === 'add_time') {
    ctx.session.adminAction = null;
    dbApi.addContactTime(text);
    await ctx.reply("✅ Vaqt qo'shildi.");
    return showTimes(ctx);
  }

  // REMOVE TIME
  if (action === 'remove_time') {
    ctx.session.adminAction = null;
    const id = parseInt(text);
    if (!id) return ctx.reply("❌ Noto'g'ri ID.", backKb());
    dbApi.removeContactTime(id);
    await ctx.reply("✅ O'chirildi.");
    return showTimes(ctx);
  }

  // BLOCK USER
  if (action === 'block_user') {
    ctx.session.adminAction = null;
    const id = parseInt(text);
    if (!id) return ctx.reply("❌ Noto'g'ri ID.", backKb());
    if (dbApi.isAdmin(id)) return ctx.reply('❌ Adminni bloklab bo\'lmaydi.', backKb());
    dbApi.blockUser(id);
    await ctx.reply(`✅ ${id} bloklandi.`);
    return showBlocked(ctx);
  }

  // UNBLOCK USER
  if (action === 'unblock_user') {
    ctx.session.adminAction = null;
    const id = parseInt(text);
    if (!id) return ctx.reply("❌ Noto'g'ri ID.", backKb());
    dbApi.unblockUser(id);
    await ctx.reply(`✅ ${id} blokdan chiqarildi.`);
    return showBlocked(ctx);
  }

  // ADD ADMIN
  if (action === 'add_admin') {
    ctx.session.adminAction = null;
    if (!dbApi.isSuperAdmin(ctx.from.id)) return ctx.reply('❌ Faqat Super Admin.', backKb());
    const id = parseInt(text);
    if (!id) return ctx.reply("❌ Noto'g'ri ID.", backKb());
    dbApi.addAdmin(id);
    await ctx.reply(`✅ ${id} admin qilindi.`);
    return showAdmins(ctx);
  }

  // REMOVE ADMIN
  if (action === 'remove_admin') {
    ctx.session.adminAction = null;
    if (!dbApi.isSuperAdmin(ctx.from.id)) return ctx.reply('❌ Faqat Super Admin.', backKb());
    const id = parseInt(text);
    if (!id) return ctx.reply("❌ Noto'g'ri ID.", backKb());
    if (dbApi.isSuperAdmin(id)) return ctx.reply("❌ Super adminni o'chirib bo'lmaydi.", backKb());
    dbApi.removeAdmin(id);
    await ctx.reply(`✅ ${id} adminlikdan olindi.`);
    return showAdmins(ctx);
  }

  // SET GROUP ID
  if (action === 'set_group_id') {
    ctx.session.adminAction = null;
    dbApi.setSetting('group_id', text);
    return ctx.reply(`✅ Guruh ID o'zgartirildi: \`${text}\``, { parse_mode: 'Markdown', ...backKb() });
  }
});

module.exports = { admin, ADMIN_SCENE };

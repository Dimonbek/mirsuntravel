const { Scenes } = require('telegraf');
const { t } = require('../locales');
const { dbApi } = require('../database');
const kb = require('../keyboards');
const { sendToCrm } = require('../crm');

const SURVEY_SCENE = 'survey';

const S = {
  PICK_LANG: 'pick_lang',
  ASK_PHONE: 'ask_phone',
  ASK_SERVICE: 'ask_service',
  ASK_ROUTE: 'ask_route',
  ASK_DEST: 'ask_dest',
  ASK_CUSTOM_DEST: 'ask_custom_dest',
  ASK_STARS: 'ask_stars',
  ASK_DATE: 'ask_date',
  ASK_PEOPLE: 'ask_people',
  ASK_PEOPLE_CUSTOM: 'ask_people_custom',
  ASK_CHILDREN: 'ask_children',
  ASK_CHILDREN_COUNT: 'ask_children_count',
  ASK_CHILD_AGE: 'ask_child_age',
  ASK_PAYMENT: 'ask_payment',
  ASK_INSTALLMENT: 'ask_installment',
  ASK_TIME: 'ask_time',
};

// Aviakassa/temir yo'l — sayohatdan farqli qisqa oqim (shahar/yulduz/bola so'ralmaydi)
function isTicket(data) {
  return data && (data.service_type === 'aviakassa' || data.service_type === 'temir_yol');
}

function previousState(state, data) {
  const hasChildren = data && data.has_children;
  const ticket = isTicket(data);
  switch (state) {
    case S.ASK_PHONE: return null;
    case S.ASK_SERVICE: return S.ASK_PHONE;
    case S.ASK_ROUTE: return S.ASK_SERVICE;
    case S.ASK_DEST: return S.ASK_SERVICE;
    case S.ASK_CUSTOM_DEST: return S.ASK_DEST;
    case S.ASK_STARS: return S.ASK_DEST;
    case S.ASK_DATE: return S.ASK_STARS;
    case S.ASK_PEOPLE: return S.ASK_DATE;
    case S.ASK_PEOPLE_CUSTOM: return S.ASK_PEOPLE;
    case S.ASK_CHILDREN: return ticket ? S.ASK_ROUTE : S.ASK_PEOPLE;
    case S.ASK_CHILDREN_COUNT: return S.ASK_CHILDREN;
    case S.ASK_CHILD_AGE: return S.ASK_CHILDREN_COUNT;
    case S.ASK_PAYMENT: return hasChildren ? S.ASK_CHILD_AGE : S.ASK_CHILDREN;
    case S.ASK_INSTALLMENT: return S.ASK_PAYMENT;
    case S.ASK_TIME: return S.ASK_PAYMENT;
    default: return null;
  }
}

// Bazada o'zgarmas kod saqlanadi ('3'/'4'/'5', 'naqd'/'nasiya') —
// ko'rsatishda foydalanuvchi tiliga o'giriladi.
function starsText(lang, stars) {
  const opt = kb.STAR_OPTIONS.find(o => o.key === String(stars));
  return opt ? t(lang, opt.tKey) : String(stars);
}

// payment_type: 'naqd' yoki 'nasiya:anor' ko'rinishida saqlanadi
function paymentText(lang, key) {
  if (!key) return '';
  if (key.startsWith('nasiya:')) {
    const inst = kb.INSTALLMENT_OPTIONS.find(o => o.key === key.slice(7));
    const base = t(lang, 'payInstallment');
    return inst ? base + ' (' + t(lang, inst.tKey) + ')' : base;
  }
  const opt = kb.PAYMENT_OPTIONS.find(o => o.key === key);
  return opt ? t(lang, opt.tKey) : String(key);
}

function serviceText(lang, key) {
  const opt = kb.SERVICE_OPTIONS.find(o => o.key === key);
  return opt ? t(lang, opt.tKey) : String(key);
}

function isValidDestination(text) {
  if (text.length < 3 || text.length > 100) return false;
  if (!/^[a-zA-ZА-Яа-яЁёўғҳқЎҒҲҚʻ'`\s\-,\.]+$/.test(text)) return false;
  const letters = text.match(/[a-zA-ZА-Яа-яЁёўғҳқЎҒҲҚ]/g);
  if (!letters || letters.length < 3) return false;
  const VOWELS = 'aeiouyAEIOUYаеёиоуыэюяАЕЁИОУЫЭЮЯ';
  let has = false;
  for (const ch of text) if (VOWELS.includes(ch)) { has = true; break; }
  if (!has) return false;
  if (/(.)\1{3,}/.test(text)) return false;
  return true;
}

function isValidNumber(text, min, max) {
  if (!/^\d+$/.test(text.trim())) return false;
  const num = parseInt(text.trim());
  return num >= (min || 1) && num <= (max || 999);
}

// O'chirish funksiyalari (no-op) — tezlik uchun olib tashlandi
function deletePrevBot(ctx) { /* no-op */ }
function trackMsg(ctx, msg) { /* no-op */ }
function tryDeleteUserMsg(ctx) { /* no-op */ }

const survey = new Scenes.BaseScene(SURVEY_SCENE);

survey.enter(async (ctx) => {
  ctx.session.surveyData = {};
  ctx.session.state = S.PICK_LANG;
  ctx.session.botMsgIds = [];
  const sent = await ctx.reply(t('uz', 'chooseLanguage'), kb.languageInline());
  trackMsg(ctx, sent);
});

async function promptState(ctx, state) {
  deletePrevBot(ctx); // Fonda, kutilmaydi — TEZ
  const lang = ctx.session.lang || 'uz';
  ctx.session.state = state;
  const opts = { parse_mode: 'Markdown' };
  let sent;
  switch (state) {
    case S.PICK_LANG:
      sent = await ctx.reply(t('uz', 'chooseLanguage'), kb.languageInline());
      break;
    case S.ASK_PHONE:
      sent = await ctx.reply(t(lang, 'askPhone'), kb.phoneReply(lang));
      break;
    case S.ASK_SERVICE:
      sent = await ctx.reply(t(lang, 'chooseService'), kb.serviceInline(lang));
      break;
    case S.ASK_ROUTE:
      sent = await ctx.reply(t(lang, 'askRoute'), { ...opts, ...kb.backInline(lang) });
      break;
    case S.ASK_DEST:
      sent = await ctx.reply(t(lang, 'askDestination'), { ...opts, ...kb.destinationsInline(lang) });
      break;
    case S.ASK_CUSTOM_DEST:
      sent = await ctx.reply(t(lang, 'askCustomDestination'), { ...opts, ...kb.backInline(lang) });
      break;
    case S.ASK_STARS:
      sent = await ctx.reply(t(lang, 'askHotelStars'), kb.hotelStarsInline(lang));
      break;
    case S.ASK_DATE:
      sent = await ctx.reply(t(lang, 'askDate'), kb.datesInline(lang));
      break;
    case S.ASK_PEOPLE:
      sent = await ctx.reply(t(lang, 'askPeople'), kb.peopleInline(lang));
      break;
    case S.ASK_PEOPLE_CUSTOM:
      sent = await ctx.reply(t(lang, 'askPeopleCustom'), kb.backInline(lang));
      break;
    case S.ASK_CHILDREN:
      sent = await ctx.reply(t(lang, 'askChildren'), kb.yesNoInline(lang));
      break;
    case S.ASK_CHILDREN_COUNT:
      sent = await ctx.reply(t(lang, 'askChildrenCount'), kb.childrenCountInline(lang));
      break;
    case S.ASK_CHILD_AGE: {
      const idx = ctx.session.currentChild || 1;
      const total = parseInt(ctx.session.surveyData.children_count) || 0;
      const msg = t(lang, 'askChildAge').replace(/\{n\}/g, idx).replace('{total}', total);
      sent = await ctx.reply(msg, kb.childAgeInline(lang));
      break;
    }
    case S.ASK_PAYMENT:
      sent = await ctx.reply(t(lang, 'askPaymentType'), kb.paymentInline(lang));
      break;
    case S.ASK_INSTALLMENT:
      sent = await ctx.reply(t(lang, 'askInstallment'), kb.installmentInline(lang));
      break;
    case S.ASK_TIME:
      sent = await ctx.reply(t(lang, 'askContactTime'), kb.contactTimesInline(lang));
      break;
  }
  trackMsg(ctx, sent);
}

survey.command('start', async (ctx) => {
  await ctx.scene.leave();
  return ctx.scene.enter(SURVEY_SCENE);
});

survey.command(['til', 'language'], async (ctx) => {
  const lang = ctx.session.lang || 'uz';
  await ctx.reply(t(lang, 'chooseLanguage'), kb.languageInline());
});

survey.command('admin', async (ctx) => {
  if (!dbApi.isAdmin(ctx.from.id)) return ctx.reply("Sizda admin huquqlari yo'q.");
  await ctx.scene.leave();
  return ctx.scene.enter('admin');
});

survey.command('myid', async (ctx) => {
  await ctx.reply('Sizning Telegram ID: `' + ctx.from.id + '`', { parse_mode: 'Markdown' });
});

survey.command('help', async (ctx) => {
  const isAdmin = dbApi.isAdmin(ctx.from.id);
  let msg = "/start - Boshlash\n/til - Tilni o'zgartirish\n/myid - Telegram ID";
  if (isAdmin) msg += '\n/admin - Admin panel';
  await ctx.reply(msg);
});

survey.action(/^lang_(uz|ru)$/, async (ctx) => {
  const newLang = ctx.match[1];
  const wasFirstTime = ctx.session.state === S.PICK_LANG;
  ctx.session.lang = newLang;
  dbApi.setUserLanguage(ctx.from.id, newLang);
  await ctx.answerCbQuery(newLang === 'uz' ? "✅ O'zbek tili" : '✅ Русский язык');
  if (wasFirstTime) {
    await promptState(ctx, S.ASK_PHONE);
  } else {
    await promptState(ctx, ctx.session.state);
  }
});

survey.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  const data = ctx.session.surveyData || {};
  const hasChildren = data.has_children;
  const currentState = ctx.session.state;
  const prev = previousState(currentState, data);
  if (!prev) return;
  if (currentState === S.ASK_ROUTE) {
    // Yo'nalish matnidan xizmat tanloviga qaytiladi
    delete data.route;
    delete data.service_type;
  } else if (currentState === S.ASK_DEST) {
    // Shaharlar ro'yxatidan xizmat tanloviga qaytiladi
    delete data.destination;
    delete data.service_type;
  } else if (currentState === S.ASK_CUSTOM_DEST) {
    // "Boshqa shahar" matnidan shaharlar ro'yxatiga qaytiladi (xizmat saqlanadi)
    delete data.destination;
  } else if (currentState === S.ASK_STARS) {
    delete data.hotel_stars;
  } else if (currentState === S.ASK_DATE) {
    delete data.travel_date;
  } else if (currentState === S.ASK_PEOPLE || currentState === S.ASK_PEOPLE_CUSTOM) {
    delete data.people_count;
  } else if (currentState === S.ASK_CHILDREN) {
    delete data.has_children;
  } else if (currentState === S.ASK_CHILDREN_COUNT) {
    delete data.children_count;
  } else if (currentState === S.ASK_CHILD_AGE) {
    if (ctx.session.currentChild && ctx.session.currentChild > 1) {
      ctx.session.currentChild--;
      if (ctx.session.childAges) ctx.session.childAges.pop();
      await promptState(ctx, S.ASK_CHILD_AGE);
      return;
    } else {
      delete data.children_count;
      ctx.session.currentChild = 0;
      ctx.session.childAges = [];
    }
  } else if (currentState === S.ASK_PAYMENT) {
    delete data.payment_type;
    // Bolalar yoshiga qaytilsa — oxirgi javobni olib tashlaymiz, aks holda
    // qayta tanlanganda ro'yxatga ortiqcha yosh qo'shilib ketadi.
    if (hasChildren && ctx.session.childAges && ctx.session.childAges.length) {
      ctx.session.childAges.pop();
      ctx.session.currentChild = ctx.session.childAges.length + 1;
      delete data.children_ages;
    }
  } else if (currentState === S.ASK_TIME) {
    delete data.contact_time;
  }
  await promptState(ctx, prev);
});

survey.action(/^svc:(.+)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_SERVICE) return ctx.answerCbQuery();
  const option = kb.SERVICE_OPTIONS.find(o => o.key === ctx.match[1]);
  if (!option) return ctx.answerCbQuery();
  const lang = ctx.session.lang || 'uz';
  await ctx.answerCbQuery('✅ ' + t(lang, option.tKey));
  ctx.session.surveyData.service_type = option.key;
  // Sayohat → shaharlar oqimi; aviakassa/temir yo'l → yo'nalish matni
  if (option.key === 'sayohat') {
    await promptState(ctx, S.ASK_DEST);
  } else {
    await promptState(ctx, S.ASK_ROUTE);
  }
});

survey.action(/^dest:(.+)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_DEST) return ctx.answerCbQuery();
  const val = ctx.match[1];
  await ctx.answerCbQuery();
  if (val === 'other') return promptState(ctx, S.ASK_CUSTOM_DEST);
  const tour = kb.TOURS[parseInt(val)];
  if (!tour) return;
  ctx.session.surveyData.destination = tour;
  await promptState(ctx, S.ASK_STARS);
});

survey.action(/^stars:(.+)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_STARS) return ctx.answerCbQuery();
  const option = kb.STAR_OPTIONS.find(o => o.key === ctx.match[1]);
  if (!option) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  ctx.session.surveyData.hotel_stars = option.key;
  await promptState(ctx, S.ASK_DATE);
});

survey.action(/^date:(.+)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_DATE) return ctx.answerCbQuery();
  const lang = ctx.session.lang || 'uz';
  const option = kb.DATE_OPTIONS.find(o => o.key === ctx.match[1]);
  if (!option) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  ctx.session.surveyData.travel_date = t(lang, option.tKey);
  await promptState(ctx, S.ASK_PEOPLE);
});

survey.action(/^people:(.+)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_PEOPLE) return ctx.answerCbQuery();
  const val = ctx.match[1];
  const lang = ctx.session.lang || 'uz';
  await ctx.answerCbQuery();
  if (val === 'more') return promptState(ctx, S.ASK_PEOPLE_CUSTOM);
  if (val === 'partner') {
    ctx.session.surveyData.people_count = '1 (' + t(lang, 'peoplePartner') + ')';
  } else {
    ctx.session.surveyData.people_count = val;
  }
  await promptState(ctx, S.ASK_CHILDREN);
});

survey.action(/^children_(yes|no)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_CHILDREN) return ctx.answerCbQuery();
  const hasChildren = ctx.match[1] === 'yes';
  const ticket = isTicket(ctx.session.surveyData);
  await ctx.answerCbQuery();
  // Odam soni tekshiruvi faqat sayohatda (kassada yo'lovchi soni yo'q)
  if (!ticket) {
    const peopleCount = parseInt(ctx.session.surveyData.people_count) || 0;
    if (hasChildren && peopleCount <= 1) {
      const lang = ctx.session.lang || 'uz';
      await ctx.reply(lang === 'uz'
        ? "❌ Bolalar bo'lsa, kamida 2 kishi bo'lishi kerak."
        : '❌ Если есть дети, нужно минимум 2 человека.');
      await promptState(ctx, S.ASK_CHILDREN);
      return;
    }
  }
  ctx.session.surveyData.has_children = hasChildren;
  if (hasChildren) {
    await promptState(ctx, S.ASK_CHILDREN_COUNT);
  } else if (ticket) {
    // Kassa: bola yo'q → so'rov tugadi
    await finishSurvey(ctx);
  } else {
    await promptState(ctx, S.ASK_PAYMENT);
  }
});

survey.action(/^cc:(\d+)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_CHILDREN_COUNT) return ctx.answerCbQuery();
  const cnt = parseInt(ctx.match[1]);
  const lang = ctx.session.lang || 'uz';
  // Bolalar soni < odam soni tekshiruvi faqat sayohatda
  if (!isTicket(ctx.session.surveyData)) {
    const peopleCount = parseInt(ctx.session.surveyData.people_count) || 0;
    if (cnt >= peopleCount) {
      await ctx.answerCbQuery();
      const msg = t(lang, 'invalidChildrenMath').replace('{p}', peopleCount).replace('{c}', cnt);
      await ctx.reply(msg);
      return;
    }
  }
  await ctx.answerCbQuery();
  ctx.session.surveyData.children_count = String(cnt);
  ctx.session.currentChild = 1;
  ctx.session.childAges = [];
  await promptState(ctx, S.ASK_CHILD_AGE);
});

survey.action(/^age:(.+)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_CHILD_AGE) return ctx.answerCbQuery();
  const lang = ctx.session.lang || 'uz';
  const option = kb.AGE_OPTIONS.find(o => o.key === ctx.match[1]);
  if (!option) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  if (!ctx.session.childAges) ctx.session.childAges = [];
  ctx.session.childAges.push(t(lang, option.tKey));
  const total = parseInt(ctx.session.surveyData.children_count) || 0;
  if (ctx.session.currentChild >= total) {
    ctx.session.surveyData.children_ages = ctx.session.childAges.join(', ');
    // Kassa: yoshlardan keyin so'rov tugadi; sayohat: to'lovga o'tadi
    if (isTicket(ctx.session.surveyData)) await finishSurvey(ctx);
    else await promptState(ctx, S.ASK_PAYMENT);
  } else {
    ctx.session.currentChild++;
    await promptState(ctx, S.ASK_CHILD_AGE);
  }
});

survey.action(/^pay:(.+)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_PAYMENT) return ctx.answerCbQuery();
  const option = kb.PAYMENT_OPTIONS.find(o => o.key === ctx.match[1]);
  if (!option) return ctx.answerCbQuery();
  const lang = ctx.session.lang || 'uz';
  await ctx.answerCbQuery('✅ ' + t(lang, option.tKey));
  // Nasiya → ichki tanlov (Anor/Uzum/Zoodpay/Paylater); Naqd → to'g'ri vaqtga
  if (option.key === 'nasiya') {
    await promptState(ctx, S.ASK_INSTALLMENT);
  } else {
    ctx.session.surveyData.payment_type = option.key;
    await promptState(ctx, S.ASK_TIME);
  }
});

survey.action(/^inst:(.+)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_INSTALLMENT) return ctx.answerCbQuery();
  const option = kb.INSTALLMENT_OPTIONS.find(o => o.key === ctx.match[1]);
  if (!option) return ctx.answerCbQuery();
  const lang = ctx.session.lang || 'uz';
  await ctx.answerCbQuery('✅ ' + t(lang, option.tKey));
  ctx.session.surveyData.payment_type = 'nasiya:' + option.key;
  await promptState(ctx, S.ASK_TIME);
});

survey.action(/^time_(\d+)$/, async (ctx) => {
  if (ctx.session.state !== S.ASK_TIME) return ctx.answerCbQuery();
  const id = parseInt(ctx.match[1]);
  const times = dbApi.getContactTimes();
  const time = times.find(x => x.id === id);
  if (!time) return ctx.answerCbQuery('❌');
  ctx.session.surveyData.contact_time = time.label;
  await ctx.answerCbQuery('✅ ' + time.label);
  await deletePrevBot(ctx);
  await finishSurvey(ctx);
});

survey.on('contact', async (ctx) => {
  if (ctx.session.state !== S.ASK_PHONE) return;
  ctx.session.surveyData.phone = ctx.message.contact.phone_number;
  await tryDeleteUserMsg(ctx);
  // Reply keyboard ni olib tashlash uchun bir martalik xabar
  try {
    const removeMsg = await ctx.reply('✅', kb.removeReply());
    try { await ctx.telegram.deleteMessage(ctx.chat.id, removeMsg.message_id); } catch (e) {}
  } catch (e) {}
  await promptState(ctx, S.ASK_SERVICE);
});

survey.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const lang = ctx.session.lang || 'uz';
  const state = ctx.session.state;
  if (text.startsWith('/')) return;
  switch (state) {
    case S.PICK_LANG:
      await ctx.reply(t('uz', 'chooseLanguage'), kb.languageInline());
      break;
    case S.ASK_PHONE: {
      const digits = text.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        await ctx.reply(t(lang, 'invalidPhone'), { parse_mode: 'Markdown' });
        return;
      }
      ctx.session.surveyData.phone = text;
      await tryDeleteUserMsg(ctx);
      try {
        const removeMsg = await ctx.reply('✅', kb.removeReply());
        try { await ctx.telegram.deleteMessage(ctx.chat.id, removeMsg.message_id); } catch (e) {}
      } catch (e) {}
      await promptState(ctx, S.ASK_SERVICE);
      break;
    }
    case S.ASK_SERVICE:
      await promptState(ctx, S.ASK_SERVICE);
      break;
    case S.ASK_ROUTE:
      if (text.length < 3 || text.length > 200) {
        await ctx.reply(t(lang, 'invalidRoute'), { parse_mode: 'Markdown' });
        return;
      }
      ctx.session.surveyData.route = text;
      await tryDeleteUserMsg(ctx);
      // Kassa: yo'lovchi soni yo'q — to'g'ridan bolalar savoliga
      await promptState(ctx, S.ASK_CHILDREN);
      break;
    case S.ASK_DEST:
      await promptState(ctx, S.ASK_DEST);
      break;
    case S.ASK_CUSTOM_DEST:
      if (!isValidDestination(text)) {
        await ctx.reply(t(lang, 'invalidDestination'), { parse_mode: 'Markdown' });
        return;
      }
      ctx.session.surveyData.destination = text;
      await tryDeleteUserMsg(ctx);
      await promptState(ctx, S.ASK_STARS);
      break;
    case S.ASK_STARS:
      await promptState(ctx, S.ASK_STARS);
      break;
    case S.ASK_DATE:
      await promptState(ctx, S.ASK_DATE);
      break;
    case S.ASK_PEOPLE:
      await promptState(ctx, S.ASK_PEOPLE);
      break;
    case S.ASK_PEOPLE_CUSTOM:
      if (!isValidNumber(text, 1, 50)) {
        await ctx.reply(t(lang, 'invalidPeople'), { parse_mode: 'Markdown' });
        return;
      }
      ctx.session.surveyData.people_count = text;
      await tryDeleteUserMsg(ctx);
      await promptState(ctx, S.ASK_CHILDREN);
      break;
    case S.ASK_CHILDREN:
      await promptState(ctx, S.ASK_CHILDREN);
      break;
    case S.ASK_CHILDREN_COUNT:
      await promptState(ctx, S.ASK_CHILDREN_COUNT);
      break;
    case S.ASK_CHILD_AGE:
      await promptState(ctx, S.ASK_CHILD_AGE);
      break;
    case S.ASK_PAYMENT:
      await promptState(ctx, S.ASK_PAYMENT);
      break;
    case S.ASK_INSTALLMENT:
      await promptState(ctx, S.ASK_INSTALLMENT);
      break;
    case S.ASK_TIME:
      await promptState(ctx, S.ASK_TIME);
      break;
    default:
      await ctx.scene.leave();
      await ctx.scene.enter(SURVEY_SCENE);
  }
});

async function finishSurvey(ctx) {
  const lang = ctx.session.lang || 'uz';
  ctx.session.surveyData.telegram_id = ctx.from.id;
  ctx.session.surveyData.language = lang;
  // Qaysi reklamadan kelgani (t.me/bot?start=<kod>)
  ctx.session.surveyData.campaign_code = ctx.session.campaignCode || null;
  const manager = dbApi.getNextManager();
  ctx.session.surveyData.manager = manager;
  try { dbApi.saveSurvey(ctx.session.surveyData); } catch (e) { console.error('DB:', e); }
  await sendToGroup(ctx, ctx.session.surveyData);
  // CRM ga yuborish — bloklamaydi, xatolik bot oqimiga ta'sir qilmaydi
  sendToCrm(ctx, ctx.session.surveyData).catch((e) => console.error('CRM:', e.message));
  await ctx.reply(t(lang, 'finish'), kb.removeReply());
  return ctx.scene.leave();
}

async function sendToGroup(ctx, data) {
  const lang = data.language;
  const groupId = dbApi.getSetting('group_id') || process.env.GROUP_ID;
  if (!groupId) return;
  const username = ctx.from.username ? '@' + ctx.from.username : '—';
  const userInfo = ctx.from.first_name || username;
  const ticket = isTicket(data);

  const childrenText = data.has_children
    ? `${t(lang, 'g_childrenYes')} (${data.children_count}, ${t(lang, 'g_childrenAges')}: ${data.children_ages})`
    : t(lang, 'g_childrenNo');

  let message = t(lang, 'g_newRequest') + '\n\n';
  if (data.service_type) {
    message += t(lang, 'g_service') + ': ' + serviceText(lang, data.service_type) + '\n';
  }
  if (ticket) {
    // Kassa: yo'nalish+sana matni va bolalar (shahar/yulduz/yo'lovchi/to'lov/vaqt yo'q)
    message += t(lang, 'g_route') + ': ' + (data.route || '—') + '\n';
    message += t(lang, 'g_children') + ': ' + childrenText + '\n';
  } else {
    message += t(lang, 'g_destination') + ': ' + data.destination + '\n';
    if (data.hotel_stars) message += t(lang, 'g_hotelStars') + ': ' + starsText(lang, data.hotel_stars) + '\n';
    message += t(lang, 'g_date') + ': ' + data.travel_date + '\n';
    message += t(lang, 'g_people') + ': ' + data.people_count + '\n';
    message += t(lang, 'g_children') + ': ' + childrenText + '\n';
    if (data.payment_type) message += t(lang, 'g_paymentType') + ': ' + paymentText(lang, data.payment_type) + '\n';
  }
  if (data.contact_time) message += t(lang, 'g_contactTime') + ': ' + data.contact_time + '\n';
  message +=
    t(lang, 'g_phone') + ': ' + data.phone + '\n' +
    t(lang, 'g_username') + ': ' + username + '\n' +
    '👤 ' + (lang === 'uz' ? 'Foydalanuvchi' : 'Пользователь') + ': ' + userInfo;
  if (data.manager) {
    message += '\n\n👨‍💼 ' + (lang === 'uz' ? 'Menejer' : 'Менеджер') + ': ' + data.manager;
  }

  try {
    await ctx.telegram.sendMessage(groupId, message);
    console.log('OK guruhga:', groupId);
    return;
  } catch (err) {
    console.error('Guruh xato (' + groupId + '):', err.message);
  }

  if (!String(groupId).startsWith('-100')) {
    const altId = '-100' + String(groupId).replace(/^-/, '');
    try {
      await ctx.telegram.sendMessage(altId, message);
      dbApi.setSetting('group_id', altId);
      console.log('OK guruhga (-100):', altId);
      return;
    } catch (e2) {
      console.error('Guruh xato (' + altId + '):', e2.message);
    }
  }

  try {
    const superAdminId = process.env.SUPER_ADMIN_ID;
    if (superAdminId) {
      await ctx.telegram.sendMessage(
        superAdminId,
        "⚠️ Guruhga xabar yuborib bo'lmadi!\n\nGuruh ID: " + groupId + "\n\nSo'rov ma'lumotlari:\n\n" + message
      );
    }
  } catch (e) {}
}

module.exports = { survey, SURVEY_SCENE };

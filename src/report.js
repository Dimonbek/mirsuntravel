const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { dbApi } = require('./database');

const MONTHS_UZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

const SERVICE_LABELS = {
  sayohat: '✈️ Sayohat',
  aviakassa: '🎫 Aviakassa',
  temir_yol: "🚂 Temir yo'l kassa",
};
function serviceLabel(key) {
  return SERVICE_LABELS[key] || key || '—';
}

// Hisobot yuboriladigan Toshkent vaqti (oyning 1-sanasi)
const REPORT_HOUR = 9;

// Bazada 'naqd'/'nasiya' saqlanadi — hisobot va Excel uchun o'zbekcha nom
function paymentLabel(key) {
  if (key === 'naqd') return 'Naqd';
  if (key === 'nasiya') return 'Nasiya';
  if (key && key.startsWith('nasiya:')) {
    const n = key.slice(7);
    return 'Nasiya (' + n.charAt(0).toUpperCase() + n.slice(1) + ')';
  }
  return key || '—';
}

// ============ OY CHEGARALARI ============
// year/month (0-11) uchun [start, end) — sqlUtc formatida
function monthRange(year, month) {
  return {
    start: dbApi.sqlUtc(year, month, 1),
    end: dbApi.sqlUtc(year, month + 1, 1),
    label: MONTHS_UZ[((month % 12) + 12) % 12] + ' ' + year,
    key: year + '-' + String(month + 1).padStart(2, '0'),
  };
}

function previousMonth(now) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return m === 0 ? monthRange(y - 1, 11) : monthRange(y, m - 1);
}

// ============ STATISTIKA MATNI ============
function buildStatsText(range) {
  const s = dbApi.getStatsBetween(range.start, range.end);
  const lines = [];
  lines.push('📊 OYLIK HISOBOT — ' + range.label);
  lines.push('');
  lines.push("🆕 Yangi so'rovlar: " + s.total);
  lines.push('👥 Yangi foydalanuvchilar: ' + s.newUsers);

  if (s.total === 0) {
    lines.push('');
    lines.push("Bu oyda so'rov bo'lmadi.");
    return lines.join('\n');
  }

  lines.push('👶 Bolalar bilan: ' + s.withChildren);

  if (s.services && s.services.length) {
    lines.push('');
    lines.push('🧾 Xizmat turlari:');
    s.services.forEach(x => lines.push('  • ' + serviceLabel(x.service_type) + ' — ' + x.c));
  }

  if (s.destinations.length) {
    lines.push('');
    lines.push("📍 Yo'nalishlar:");
    s.destinations.forEach((d, i) => {
      lines.push('  ' + (i + 1) + '. ' + (d.destination || '—') + ' — ' + d.c);
    });
  }

  if (s.stars.length) {
    lines.push('');
    lines.push('🏨 Mehmonxona yulduzi:');
    s.stars.forEach(x => lines.push('  • ' + x.hotel_stars + '⭐ — ' + x.c));
  }

  if (s.payments.length) {
    lines.push('');
    lines.push("💳 To'lov turi:");
    s.payments.forEach(p => lines.push('  • ' + paymentLabel(p.payment_type) + ' — ' + p.c));
  }

  if (s.times.length) {
    lines.push('');
    lines.push("🕐 Bog'lanish vaqtlari:");
    s.times.forEach(t => lines.push('  • ' + (t.contact_time || '—') + ' — ' + t.c));
  }

  if (s.languages.length) {
    lines.push('');
    lines.push('🌐 Tillar:');
    s.languages.forEach(l => {
      lines.push('  • ' + (l.language === 'ru' ? 'Rus' : "O'zbek") + ' — ' + l.c);
    });
  }

  if (s.managers.length) {
    lines.push('');
    lines.push('👨‍💼 Menejerlar:');
    s.managers.forEach(m => lines.push('  • ' + m.manager + ' — ' + m.c));
  }

  if (s.campaigns.length) {
    const fromCampaign = s.campaigns.reduce((sum, c) => sum + c.c, 0);
    lines.push('');
    lines.push('📣 Reklama kampaniyalari:');
    s.campaigns.forEach(c => lines.push('  • ' + c.campaign_code + ' — ' + c.c));
    lines.push('  • (havolasiz) — ' + (s.total - fromCampaign));
  }

  return lines.join('\n');
}

// ============ EXCEL BEKAP ============
// Butun bazani Excel qilib qaytaradi (fayl yo'li). Bu bir vaqtning o'zida
// hisobot ham, off-site bekap ham — Telegram fayllarni cheksiz saqlaydi.
async function buildExcel(surveys, filename) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Surveys');
  ws.columns = [
    { header: 'ID', key: 'id', width: 6 },
    { header: 'Telegram ID', key: 'telegram_id', width: 14 },
    { header: 'Ism', key: 'full_name', width: 25 },
    { header: 'Xizmat', key: 'service_label', width: 16 },
    { header: "Yo'nalish/sana (kassa)", key: 'route', width: 24 },
    { header: "Yo'nalish", key: 'destination', width: 20 },
    { header: 'Mehmonxona', key: 'hotel_stars', width: 12 },
    { header: 'Sana', key: 'travel_date', width: 15 },
    { header: 'Odam soni', key: 'people_count', width: 12 },
    { header: 'Bolalar', key: 'has_children', width: 10 },
    { header: 'Bolalar soni', key: 'children_count', width: 12 },
    { header: 'Yoshlari', key: 'children_ages', width: 15 },
    { header: "To'lov turi", key: 'payment_type', width: 12 },
    { header: "Bog'lanish vaqti", key: 'contact_time', width: 20 },
    { header: 'Telefon', key: 'phone', width: 18 },
    { header: 'Menejer', key: 'manager', width: 18 },
    { header: 'Kampaniya', key: 'campaign_code', width: 16 },
    { header: 'Til', key: 'language', width: 6 },
    { header: 'Sana/Vaqt (UTC)', key: 'created_at', width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  surveys.forEach(s => ws.addRow({
    ...s,
    service_label: serviceLabel(s.service_type),
    has_children: s.has_children ? 'Ha' : "Yo'q",
    hotel_stars: s.hotel_stars ? s.hotel_stars + '⭐' : '',
    payment_type: s.payment_type ? paymentLabel(s.payment_type) : '',
  }));

  const exportDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  const filePath = path.join(exportDir, filename);
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

// ============ HISOBOTNI YUBORISH ============
async function sendMonthlyReport(telegram, range, chatId) {
  const groupId = chatId || dbApi.getSetting('group_id') || process.env.GROUP_ID;
  if (!groupId) {
    console.error('Hisobot: guruh ID topilmadi');
    return false;
  }

  await telegram.sendMessage(groupId, buildStatsText(range));

  // To'liq baza bekapi — oy bo'sh bo'lsa ham yuboriladi (bekap muhimroq)
  const all = dbApi.getAllSurveys();
  if (all.length) {
    let filePath;
    try {
      filePath = await buildExcel(all, `mirsuntravel_backup_${range.key}.xlsx`);
      await telegram.sendDocument(
        groupId,
        { source: filePath, filename: `mirsuntravel_backup_${range.key}.xlsx` },
        { caption: "💾 To'liq bekap — barcha so'rovlar (" + all.length + ' ta)' }
      );
    } finally {
      if (filePath) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }
  }

  console.log('✅ Oylik hisobot yuborildi:', range.label, '→', groupId);
  return true;
}

// ============ REJALASHTIRUVCHI ============
// Har 30 daqiqada tekshiradi. Oyning 1-sanasi soat 9:00 (Toshkent) dan keyin
// va bu oy uchun hali yuborilmagan bo'lsa — yuboradi.
// last_monthly_report sozlamasi takroriy yuborishning oldini oladi, shu sababli
// restart yoki redeploy bo'lsa ham hisobot ikki marta ketmaydi.
function checkAndSend(telegram) {
  try {
    const now = dbApi.tashkentNow();
    if (now.getUTCDate() !== 1 || now.getUTCHours() < REPORT_HOUR) return;

    const range = previousMonth(now);
    if (dbApi.getSetting('last_monthly_report') === range.key) return;

    sendMonthlyReport(telegram, range)
      .then(ok => {
        // Faqat muvaffaqiyatli yuborilgandan keyin belgilanadi —
        // xato bo'lsa keyingi tekshiruvda qayta urinadi
        if (ok) dbApi.setSetting('last_monthly_report', range.key);
      })
      .catch(err => console.error('Oylik hisobot xato:', err.message));
  } catch (e) {
    console.error('Hisobot tekshiruvi xato:', e.message);
  }
}

function startScheduler(telegram) {
  setInterval(() => checkAndSend(telegram), 30 * 60 * 1000);
  setTimeout(() => checkAndSend(telegram), 60 * 1000);
  const now = dbApi.tashkentNow();
  console.log('📅 Oylik hisobot rejalashtirildi | Toshkent vaqti:',
    now.toISOString().slice(0, 16).replace('T', ' '),
    '| oxirgi hisobot:', dbApi.getSetting('last_monthly_report') || '(yo\'q)');
}

module.exports = {
  startScheduler,
  sendMonthlyReport,
  buildStatsText,
  buildExcel,
  monthRange,
  previousMonth,
  paymentLabel,
  serviceLabel,
  MONTHS_UZ,
};

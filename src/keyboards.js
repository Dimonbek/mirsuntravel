const { Markup } = require('telegraf');
const { t } = require('./locales');
const { dbApi } = require('./database');

const TOURS = [
  'Sharm el-Sheyx',
  'Antaliya',
  'Istambul',
  'Baku',
  'Naftalan',
  'Tbilisi',
  'Batumi',
  'Kuala-Lumpur',
  'Langkawi',
  'Maldiv orollari',
  'Dubay',
];

const DATE_OPTIONS = [
  { key: 'soon', tKey: 'dateSoon' },
  { key: 'next_month', tKey: 'dateNextMonth' },
  { key: '3_months', tKey: 'date3Months' },
  { key: 'cheap', tKey: 'dateCheap' },
];

const AGE_OPTIONS = [
  { key: '0_2', tKey: 'age0_2' },
  { key: '3_6', tKey: 'age3_6' },
  { key: '7_11', tKey: 'age7_11' },
  { key: '12plus', tKey: 'age12plus' },
];

// Mehmonxona yulduzlari — key bazaga o'zgarmas holda yoziladi ('3','4','5')
const STAR_OPTIONS = [
  { key: '3', tKey: 'star3' },
  { key: '4', tKey: 'star4' },
  { key: '5', tKey: 'star5' },
];

// Xizmat turi — key bazaga o'zgarmas holda yoziladi
const SERVICE_OPTIONS = [
  { key: 'sayohat', tKey: 'svcTravel' },
  { key: 'aviakassa', tKey: 'svcAir' },
  { key: 'temir_yol', tKey: 'svcRail' },
];

// To'lov turi — key bazaga o'zgarmas holda yoziladi ('naqd','nasiya')
const PAYMENT_OPTIONS = [
  { key: 'naqd', tKey: 'payCash' },
  { key: 'nasiya', tKey: 'payInstallment' },
];

// Nasiya turlari — bazaga 'nasiya:anor' ko'rinishida yoziladi
const INSTALLMENT_OPTIONS = [
  { key: 'anor', tKey: 'instAnor' },
  { key: 'uzum', tKey: 'instUzum' },
  { key: 'zoodpay', tKey: 'instZoodpay' },
  { key: 'paylater', tKey: 'instPaylater' },
];

function languageInline() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🇺🇿 O'zbek tili", 'lang_uz'),
      Markup.button.callback('🇷🇺 Русский', 'lang_ru'),
    ]
  ]);
}

function serviceInline(lang) {
  const rows = SERVICE_OPTIONS.map(opt => [
    Markup.button.callback(t(lang, opt.tKey), `svc:${opt.key}`)
  ]);
  return Markup.inlineKeyboard(rows);
}

function destinationsInline(lang) {
  const rows = [];
  for (let i = 0; i < TOURS.length; i += 2) {
    const row = [Markup.button.callback('📍 ' + TOURS[i], `dest:${i}`)];
    if (TOURS[i + 1]) row.push(Markup.button.callback('📍 ' + TOURS[i + 1], `dest:${i + 1}`));
    rows.push(row);
  }
  rows.push([Markup.button.callback(lang === 'ru' ? '🏙 Другой город' : '🏙 Boshqa shahar', 'dest:other')]);
  rows.push([Markup.button.callback(t(lang, 'backBtn'), 'back')]);
  return Markup.inlineKeyboard(rows);
}

function datesInline(lang) {
  const rows = DATE_OPTIONS.map(opt => [
    Markup.button.callback(t(lang, opt.tKey), `date:${opt.key}`)
  ]);
  rows.push([Markup.button.callback(t(lang, 'backBtn'), 'back')]);
  return Markup.inlineKeyboard(rows);
}

function peopleInline(lang) {
  const rows = [
    [
      Markup.button.callback(t(lang, 'peopleAlone'), 'people:1'),
      Markup.button.callback(t(lang, 'peoplePartner'), 'people:partner'),
    ],
    [
      Markup.button.callback('2', 'people:2'),
      Markup.button.callback('3', 'people:3'),
      Markup.button.callback('4', 'people:4'),
    ],
    [
      Markup.button.callback('5', 'people:5'),
      Markup.button.callback('6', 'people:6'),
      Markup.button.callback('7', 'people:7'),
    ],
    [Markup.button.callback(t(lang, 'peopleMore'), 'people:more')],
    [Markup.button.callback(t(lang, 'backBtn'), 'back')],
  ];
  return Markup.inlineKeyboard(rows);
}

function yesNoInline(lang) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ ' + t(lang, 'yes'), 'children_yes'),
      Markup.button.callback('❌ ' + t(lang, 'no'), 'children_no'),
    ],
    [Markup.button.callback(t(lang, 'backBtn'), 'back')]
  ]);
}

function childrenCountInline(lang) {
  const rows = [
    [
      Markup.button.callback('1', 'cc:1'),
      Markup.button.callback('2', 'cc:2'),
      Markup.button.callback('3', 'cc:3'),
    ],
    [
      Markup.button.callback('4', 'cc:4'),
      Markup.button.callback('5', 'cc:5'),
      Markup.button.callback('6', 'cc:6'),
    ],
    [Markup.button.callback(t(lang, 'backBtn'), 'back')],
  ];
  return Markup.inlineKeyboard(rows);
}

function childAgeInline(lang) {
  const rows = AGE_OPTIONS.map(opt => [
    Markup.button.callback(t(lang, opt.tKey), `age:${opt.key}`)
  ]);
  rows.push([Markup.button.callback(t(lang, 'backBtn'), 'back')]);
  return Markup.inlineKeyboard(rows);
}

function hotelStarsInline(lang) {
  const rows = STAR_OPTIONS.map(opt => [
    Markup.button.callback(t(lang, opt.tKey), `stars:${opt.key}`)
  ]);
  rows.push([Markup.button.callback(t(lang, 'backBtn'), 'back')]);
  return Markup.inlineKeyboard(rows);
}

function paymentInline(lang) {
  const rows = [
    PAYMENT_OPTIONS.map(opt => Markup.button.callback(t(lang, opt.tKey), `pay:${opt.key}`)),
    [Markup.button.callback(t(lang, 'backBtn'), 'back')],
  ];
  return Markup.inlineKeyboard(rows);
}

function installmentInline(lang) {
  const rows = [];
  for (let i = 0; i < INSTALLMENT_OPTIONS.length; i += 2) {
    const row = [Markup.button.callback(t(lang, INSTALLMENT_OPTIONS[i].tKey), `inst:${INSTALLMENT_OPTIONS[i].key}`)];
    if (INSTALLMENT_OPTIONS[i + 1]) {
      row.push(Markup.button.callback(t(lang, INSTALLMENT_OPTIONS[i + 1].tKey), `inst:${INSTALLMENT_OPTIONS[i + 1].key}`));
    }
    rows.push(row);
  }
  rows.push([Markup.button.callback(t(lang, 'backBtn'), 'back')]);
  return Markup.inlineKeyboard(rows);
}

function contactTimesInline(lang) {
  const times = dbApi.getContactTimes();
  const rows = [];
  for (let i = 0; i < times.length; i += 2) {
    const row = [Markup.button.callback('🕐 ' + times[i].label, `time_${times[i].id}`)];
    if (times[i + 1]) {
      row.push(Markup.button.callback('🕐 ' + times[i + 1].label, `time_${times[i + 1].id}`));
    }
    rows.push(row);
  }
  rows.push([Markup.button.callback(t(lang, 'backBtn'), 'back')]);
  return Markup.inlineKeyboard(rows);
}

function backInline(lang) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'backBtn'), 'back')]
  ]);
}

function phoneReply(lang) {
  return Markup.keyboard([
    [Markup.button.contactRequest(t(lang, 'sharePhone'))],
  ]).resize().oneTime();
}

function removeReply() {
  return Markup.removeKeyboard();
}

module.exports = {
  TOURS,
  DATE_OPTIONS,
  AGE_OPTIONS,
  STAR_OPTIONS,
  SERVICE_OPTIONS,
  PAYMENT_OPTIONS,
  INSTALLMENT_OPTIONS,
  languageInline,
  serviceInline,
  destinationsInline,
  datesInline,
  peopleInline,
  yesNoInline,
  childrenCountInline,
  childAgeInline,
  hotelStarsInline,
  paymentInline,
  installmentInline,
  contactTimesInline,
  backInline,
  phoneReply,
  removeReply,
};

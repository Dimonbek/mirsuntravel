// CRM webhook integratsiyasi — leadni Revator CRM ga yuboradi.
// Xatolik bo'lsa bot ishlashiga ta'sir qilmaydi (fire-and-forget).

function peopleToNumber(peopleCount) {
  if (!peopleCount) return 1;
  const m = String(peopleCount).match(/\d+/);
  return m ? parseInt(m[0], 10) : 1;
}

function childrenText(data) {
  if (!data.has_children) return "Yo'q";
  const parts = [];
  if (data.children_count) parts.push(`${data.children_count} ta`);
  if (data.children_ages) parts.push(`yosh: ${data.children_ages}`);
  return `Ha${parts.length ? ' (' + parts.join(', ') + ')' : ''}`;
}

// 'naqd' / 'nasiya' / 'nasiya:anor' → CRM da o'qiladigan matn
function paymentTypeText(paymentType) {
  if (!paymentType) return undefined;
  if (paymentType === 'naqd') return 'Naqd';
  if (paymentType === 'nasiya') return 'Nasiya';
  if (paymentType.startsWith('nasiya:')) {
    const name = paymentType.slice(7);
    return 'Nasiya (' + name.charAt(0).toUpperCase() + name.slice(1) + ')';
  }
  return undefined;
}

// 'sayohat' / 'aviakassa' / 'temir_yol' → CRM matni
function serviceTypeText(serviceType) {
  if (serviceType === 'aviakassa') return 'Aviakassa';
  if (serviceType === 'temir_yol') return "Temir yo'l kassa";
  return 'Sayohat';
}

/** Startupда holatni ko'rsatish uchun */
function crmStatus() {
  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) return "O'CHIQ (CRM_WEBHOOK_URL yo'q)";
  const secret = process.env.CRM_WEBHOOK_SECRET ? 'kalit bor' : 'KALIT YO\'Q';
  return `YOQILGAN → ${url} (${secret})`;
}

async function sendToCrm(ctx, data) {
  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) {
    console.log("CRM: CRM_WEBHOOK_URL yo'q — lead yuborilmadi");
    return;
  }

  // CRM 'destination' ni majburiy qiladi. Kassa oqimida shahar yo'q — shuning
  // uchun yo'nalish matnini xizmat turi bilan birga destination sifatida yuboramiz.
  // Shunda lead CRM'ga tushadi va menejer nima ekanini darhol ko'radi.
  const isTicket = data.service_type === 'aviakassa' || data.service_type === 'temir_yol';
  const crmDestination = isTicket
    ? serviceTypeText(data.service_type) + ': ' + (data.route || '—')
    : (data.destination || undefined);

  const payload = {
    phone: data.phone,
    serviceType: data.service_type || 'sayohat',
    serviceTypeText: serviceTypeText(data.service_type),
    route: data.route || undefined,
    destination: crmDestination,
    hotelStars: data.hotel_stars ? parseInt(data.hotel_stars, 10) : undefined,
    travelDateText: data.travel_date,
    travelers: peopleToNumber(data.people_count),
    childrenText: childrenText(data),
    paymentType: data.payment_type || undefined,
    paymentTypeText: paymentTypeText(data.payment_type),
    contactTime: data.contact_time,
    telegramUsername: ctx.from && ctx.from.username ? '@' + ctx.from.username : undefined,
    telegramUserId: data.telegram_id,
    managerSuggestion: data.manager || undefined,
    campaignCode: data.campaign_code || undefined,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.CRM_WEBHOOK_SECRET || '',
      },
      body: JSON.stringify(payload),
      // 8 soniya timeout
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      const camp = payload.campaignCode ? ` (kampaniya: ${payload.campaignCode})` : '';
      console.log('OK CRM ga:', (j.leadId || res.status) + camp);
    } else {
      console.error('CRM webhook xato:', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.error('CRM webhook yuborilmadi:', e.message);
  }
}

module.exports = { sendToCrm, crmStatus };

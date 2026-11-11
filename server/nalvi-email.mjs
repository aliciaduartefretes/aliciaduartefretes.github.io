import { createHash } from "node:crypto";

export const NALVI_EMAIL_TEMPLATES = Object.freeze({
  registration_confirmation: "Confirmación de interés",
  cohort_details: "Información del programa",
  enrollment_open: "Inscripción y pago disponibles",
  payment_instructions: "Siguiente paso de inscripción",
  welcome_enrolled: "Bienvenida al programa",
  course_news: "Novedades de NALVI"
});

const cleanText = (value, maximum = 500) => String(value ?? "")
  .replace(/\u0000/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maximum);

const htmlEscape = value => cleanText(value, 2_000).replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[character]);

function emailConfig(env = process.env) {
  const apiKey = cleanText(env.RESEND_API_KEY, 500);
  const domain = cleanText(env.RESEND_EMAIL_DOMAIN, 253).toLowerCase();
  const replyTo = cleanText(env.NALVI_EMAIL_REPLY_TO, 160).toLowerCase() || "aliciaduartefretes@gmail.com";
  const inboundDomain = cleanText(env.NALVI_EMAIL_INBOUND_DOMAIN, 253).toLowerCase();
  const appUrl = cleanText(env.NALVI_PUBLIC_APP_URL, 300) || "https://www.idiomaguarani.com.py";
  const enabled = String(env.NALVI_EMAIL_ENABLED ?? "true").toLowerCase() !== "false";
  return {
    apiKey,
    domain,
    replyTo,
    inboundDomain,
    appUrl,
    enabled,
    operationalFrom: cleanText(env.NALVI_OPERATIONAL_EMAIL_FROM, 220) || `NALVI · Equipo Académico <cursos@${domain}>`,
    marketingFrom: cleanText(env.NALVI_MARKETING_EMAIL_FROM, 220) || `NALVI <novedades@${domain}>`
  };
}

function replyToForInterest(config, interest) {
  const crmId = cleanText(interest?.crmId, 80).toLowerCase();
  if (config.inboundDomain && /^[a-f0-9]{48}$/.test(crmId)) return `crm-${crmId}@${config.inboundDomain}`;
  return config.replyTo;
}

function emailTemplate(template, interest) {
  const name = htmlEscape(interest?.name || "");
  const greeting = name ? `Hola, ${name}:` : "Hola:";
  const commonFooter = "Si tienes alguna consulta, responde directamente a este correo. El equipo de NALVI recibirá tu mensaje.";
  const templates = {
    registration_confirmation: {
      subject: "Recibimos tu interés en Guaraní en vivo",
      preheader: "Tu solicitud quedó registrada correctamente.",
      paragraphs: [
        greeting,
        "Recibimos correctamente tu solicitud para participar en Guaraní en vivo.",
        "Nuestro equipo revisará la información del grupo y se pondrá en contacto contigo para confirmar horarios, disponibilidad y el siguiente paso. Enviar este formulario no genera ningún cobro.",
        commonFooter
      ]
    },
    cohort_details: {
      subject: "Información de tu programa de Guaraní en vivo",
      preheader: "Conoce cómo funciona el programa en vivo de NALVI.",
      paragraphs: [
        greeting,
        "Gracias por tu interés en el programa Guaraní en vivo de NALVI.",
        "El programa incluye 16 encuentros en vivo durante 8 semanas, materiales de apoyo, acompañamiento docente y acceso a los recursos correspondientes durante el programa.",
        "Responde a este correo si deseas que confirmemos contigo el horario disponible y la modalidad de inscripción.",
        commonFooter
      ]
    },
    enrollment_open: {
      subject: "Ya puedes confirmar tu lugar en Guaraní en vivo",
      preheader: "La inscripción y el acceso seguro al pago ya están disponibles.",
      paragraphs: [
        greeting,
        "El grupo de Guaraní en vivo ya está listo y puedes continuar con tu inscripción.",
        "Entra a NALVI con el mismo correo que utilizaste al registrarte. Allí podrás revisar el programa y, cuando la pasarela esté habilitada, completar el pago de forma segura.",
        "Después de confirmarse el pago, NALVI habilitará automáticamente tu calendario de clases, enlaces de conexión y materiales del programa.",
        commonFooter
      ],
      cta: { label: "Ver mi inscripción en NALVI", path: "/?program=guarani-live#home" }
    },
    payment_instructions: {
      subject: "Siguiente paso para confirmar tu inscripción",
      preheader: "Tu lugar está listo para continuar con la inscripción.",
      paragraphs: [
        greeting,
        "Tu solicitud avanzó al siguiente paso de inscripción en Guaraní en vivo.",
        "Responde a este correo para que el equipo de NALVI confirme contigo el grupo, el horario y la opción de pago antes de enviarte el acceso seguro correspondiente.",
        "NALVI nunca te solicitará contraseñas ni datos completos de tu tarjeta por correo electrónico.",
        commonFooter
      ]
    },
    welcome_enrolled: {
      subject: "Te damos la bienvenida a Guaraní en vivo",
      preheader: "Tu inscripción fue confirmada.",
      paragraphs: [
        greeting,
        "¡Tu inscripción en Guaraní en vivo fue confirmada! Nos alegra acompañarte en este proceso de aprendizaje.",
        "El equipo académico te enviará por esta misma vía los datos del grupo, el horario y las indicaciones para comenzar.",
        commonFooter
      ]
    },
    course_news: {
      subject: "Novedades educativas de NALVI",
      preheader: "Nuevos recursos y propuestas para seguir aprendiendo guaraní.",
      paragraphs: [
        greeting,
        "Gracias por elegir recibir novedades de NALVI.",
        "Estamos preparando nuevas propuestas, materiales y experiencias para ayudarte a seguir aprendiendo guaraní.",
        "Si ya no deseas recibir estas novedades, responde a este correo con la palabra BAJA. Los mensajes vinculados a una inscripción activa podrán continuar cuando sean necesarios para prestar el servicio.",
        commonFooter
      ]
    }
  };
  return templates[template] || null;
}

function renderEmail(template, interest, { appUrl = "https://www.idiomaguarani.com.py" } = {}) {
  const content = emailTemplate(template, interest);
  if (!content) throw new TypeError("INVALID_EMAIL_TEMPLATE");
  const paragraphHtml = content.paragraphs.map(paragraph => `<p style="margin:0 0 18px;color:#29243e;font-size:16px;line-height:1.65">${paragraph}</p>`).join("");
  const text = content.paragraphs.map(paragraph => paragraph.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")).join("\n\n");
  const safeBase = String(appUrl || "https://www.idiomaguarani.com.py").replace(/\/$/, "");
  const ctaUrl = content.cta?.path ? `${safeBase}${content.cta.path}` : "";
  const ctaHtml = ctaUrl ? `<p style="margin:26px 0"><a href="${htmlEscape(ctaUrl)}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#4d3db5;color:#fff;text-decoration:none;font-size:16px;font-weight:800">${htmlEscape(content.cta.label)}</a></p>` : "";
  const textWithCta = ctaUrl ? `${text}\n\n${content.cta.label}: ${ctaUrl}` : text;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(content.subject)}</title></head><body style="margin:0;background:#f4f2f9;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${htmlEscape(content.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2f9;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e3dded;border-radius:20px;overflow:hidden"><tr><td style="padding:25px 30px;background:linear-gradient(135deg,#251957,#5742c8 58%,#0d8085);color:#fff"><div style="font-size:25px;font-weight:800;letter-spacing:.04em">NALVI</div><div style="margin-top:4px;font-size:12px;font-weight:700;letter-spacing:.18em">LENGUAS VIVAS</div></td></tr><tr><td style="padding:30px">${paragraphHtml}${ctaHtml}<p style="margin:26px 0 0;color:#6c657b;font-size:13px;line-height:1.55">NALVI · Educación y tecnología para lenguas vivas<br><a href="https://www.idiomaguarani.com.py" style="color:#5540c2">www.idiomaguarani.com.py</a></p></td></tr></table></td></tr></table></body></html>`;
  return { ...content, ctaUrl, html, text: textWithCta };
}

export async function sendNalviEmail({
  template,
  interest,
  env = process.env,
  fetchImpl = globalThis.fetch,
  idempotencyKey = ""
} = {}) {
  if (!Object.hasOwn(NALVI_EMAIL_TEMPLATES, template)) return { status: "failed", reason: "INVALID_EMAIL_TEMPLATE" };
  const config = emailConfig(env);
  if (!config.enabled) return { status: "skipped", reason: "EMAIL_DISABLED" };
  if (!config.apiKey || !config.domain) return { status: "skipped", reason: "EMAIL_NOT_CONFIGURED" };
  const to = cleanText(interest?.email, 160).toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(to)) return { status: "failed", reason: "VALID_EMAIL_REQUIRED" };
  if (template === "course_news" && interest?.marketingConsent !== true) return { status: "failed", reason: "MARKETING_CONSENT_REQUIRED" };
  const rendered = renderEmail(template, interest, { appUrl: config.appUrl });
  const marketing = template === "course_news";
  const from = marketing ? config.marketingFrom : config.operationalFrom;
  const replyTo = replyToForInterest(config, interest);
  const stableKey = cleanText(idempotencyKey, 220) || createHash("sha256").update(`${template}|${to}|${new Date().toISOString()}`).digest("hex");
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": stableKey
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(marketing ? { headers: { "List-Unsubscribe": `<mailto:${config.replyTo}?subject=BAJA%20NALVI>` } } : {}),
        tags: [
          { name: "category", value: template.replace(/_/g, "-") },
          { name: "program", value: "guarani-live" }
        ]
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.id) return { status: "failed", reason: "EMAIL_PROVIDER_REJECTED", httpStatus: response.status };
    return {
      status: "sent",
      id: cleanText(payload.id, 160),
      messageId: cleanText(payload.message_id, 300),
      template,
      to,
      from,
      replyTo,
      subject: cleanText(rendered.subject, 240),
      text: cleanText(rendered.text, 5_000)
    };
  } catch {
    return { status: "failed", reason: "EMAIL_PROVIDER_UNAVAILABLE" };
  }
}

export const __test = { emailConfig, emailTemplate, renderEmail, replyToForInterest };

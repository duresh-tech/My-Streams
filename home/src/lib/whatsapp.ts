interface EnquiryMessage {
  name: string;
  email: string;
  phone?: string;
  planLabel?: string;
  message?: string;
}

/**
 * wa.me needs a bare international number - no +, spaces or dashes.
 * Returns "" for a number that could not plausibly be dialled, so callers can
 * treat an unset or malformed site.json value as "no WhatsApp handoff".
 */
export function normaliseWhatsAppNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Shortest international numbers are ~8 digits including country code.
  return digits.length >= 8 ? digits : "";
}

export function buildEnquiryText(enquiry: EnquiryMessage, siteName: string): string {
  const lines = [
    `New enquiry from ${siteName}`,
    "",
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
  ];

  if (enquiry.phone) lines.push(`Phone: ${enquiry.phone}`);
  lines.push(`Plan: ${enquiry.planLabel || "Not sure yet"}`);

  if (enquiry.message) {
    lines.push("", "Broadcasting:", enquiry.message);
  }

  return lines.join("\n");
}

/** "" when there is no usable number, so the caller can skip the handoff. */
export function buildWhatsAppUrl(
  number: string,
  enquiry: EnquiryMessage,
  siteName: string,
): string {
  const to = normaliseWhatsAppNumber(number);
  if (!to) return "";

  return `https://wa.me/${to}?text=${encodeURIComponent(buildEnquiryText(enquiry, siteName))}`;
}

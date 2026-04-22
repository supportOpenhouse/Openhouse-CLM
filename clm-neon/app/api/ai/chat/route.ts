import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth-helpers";

const CHAT_SYSTEM = `You are an assistant inside Openhouse's Asset Management Agreement CLM tool, built for the Supply Ops team. You help users update agreement fields via natural language, explain clauses, and sanity-check data.

You always respond with ONLY a JSON object (no markdown, no prose outside JSON):
{
  "updates": { "<dot.path>": <value>, ... },
  "reply": "<concise message to the user>"
}

Available paths (use EXACTLY these):
- meta.agreementCode, meta.projectCode, meta.location, meta.agreementDate
- owners[i].salutation, owners[i].name, owners[i].relation, owners[i].relativeSalutation, owners[i].relativeName, owners[i].pan, owners[i].aadhar
- ownerAddress
- property.configuration, property.apartmentNo, property.buildingNo, property.floor, property.parkingCount, property.parkingNo, property.superAreaSqFt, property.superAreaSqM, property.projectName, property.village, property.sector, property.subTehsil, property.district, property.state, property.deedSerialNo, property.deedDate, property.bahiSankhyaNo, property.jildNo, property.pagesNo, property.addlBahiNo, property.addlJildNo, property.addlPages
- financial.basePrice, financial.securityDeposit, financial.monthlyRent, financial.initialPeriodDays, financial.extensionPeriodDays, financial.furnishmentDays
- loan.outstandingAmount, loan.bankName, loan.loanAccountNo
- documents.conveyanceDeedNo, documents.possessionCertificateDate, documents.allotmentLetterDate
- witnesses[0], witnesses[1]
- templateId (one of: standard_with_loan, standard_no_loan, vacant_with_loan, vacant_no_loan)

Rules:
- Interpret Indian currency naturally: "1.2 cr" = 12000000, "95 lakh" = 9500000, "22k" = 22000.
- PAN format: 10 uppercase alphanumeric. Aadhar: 12 digits (display with spaces every 4).
- For questions about clauses, return empty updates and explain in reply.
- Numbers must be JSON numbers, not strings.`;

export async function POST(request: Request) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;

  const body = await request.json();
  const { message, formData, templateId, history } = body;
  if (!message || !formData) {
    return NextResponse.json({ error: "Missing message or formData" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const recentUserMsgs = (history || [])
    .filter((m: any) => m.role === "user")
    .slice(-3)
    .map((m: any) => m.content);

  const contextPreamble = recentUserMsgs.length > 0
    ? `RECENT USER HISTORY (for context only — do not re-apply):\n${recentUserMsgs.map((m: string) => `- ${m}`).join("\n")}\n\n`
    : "";

  const context = `${contextPreamble}CURRENT FORM STATE:\n${JSON.stringify({ ...formData, templateId }, null, 2)}\n\nUSER MESSAGE:\n${message}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: CHAT_SYSTEM,
      messages: [{ role: "user", content: context }],
    });

    const text = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

    try {
      return NextResponse.json(JSON.parse(cleaned));
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { return NextResponse.json(JSON.parse(match[0])); } catch {}
      }
      return NextResponse.json({ updates: {}, reply: text || "I couldn't parse my own response — please try rephrasing." });
    }
  } catch (e: any) {
    console.error("chat error", e);
    return NextResponse.json({ error: e.message || "AI request failed" }, { status: 500 });
  }
}

export const runtime = "nodejs";

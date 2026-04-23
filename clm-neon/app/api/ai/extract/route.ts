import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth-helpers";

const EXTRACTION_SYSTEM = `You are a legal document parser for an Indian Asset Management Agreement CLM tool. Extract structured data from the provided document and return ONLY a JSON object (no markdown fences, no prose) matching this exact schema:

{
  "meta": { "agreementCode": string, "projectCode": string, "location": string, "agreementDate": "DD/MM/YYYY" },
  "owners": [{ "salutation": "Mr."|"Mrs."|"Ms.", "name": string, "relation": "son"|"wife"|"daughter"|"husband", "relativeSalutation": "Mr."|"Mrs.", "relativeName": string, "pan": string, "aadhar": string }],
  "ownerAddress": string,
  "property": { "configuration": string, "apartmentNo": string, "buildingNo": string, "floor": string, "parkingCount": string, "parkingNo": string, "superAreaSqFt": string, "superAreaSqM": string, "projectName": string, "village": string, "sector": string, "subTehsil": string, "district": string, "state": string, "deedSerialNo": string, "deedDate": string, "bahiSankhyaNo": string, "jildNo": string, "pagesNo": string, "addlBahiNo": string, "addlJildNo": string, "addlPages": string },
  "financial": { "basePrice": number, "securityDeposit": number, "monthlyRent": number, "initialPeriodDays": number, "extensionPeriodDays": number, "furnishmentDays": number },
  "loan": { "outstandingAmount": number, "bankName": string, "loanAccountNo": string },
  "documents": { "conveyanceDeedNo": string, "possessionCertificateDate": string, "allotmentLetterDate": string },
  "witnesses": [string, string]
}

Rules:
- Use empty string "" for unknown string fields, 0 for unknown numbers.
- Keep Indian currency as plain numbers (e.g. 9500000 not "95 Lakh").
- Preserve formatting for PAN (10 uppercase alphanumeric), Aadhar (with spaces), dates (DD.MM.YYYY as printed).
- If multiple owners, preserve their order.
- Return valid JSON only. No commentary, no code fences.`;

export async function POST(request: Request) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;

  const body = await request.json();
  const { base64, mediaType } = body;
  if (!base64 || !mediaType) {
    return NextResponse.json({ error: "Missing base64 or mediaType" }, { status: 400 });
  }

  const isPdf = mediaType === "application/pdf";
  const mediaBlock = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as any, data: base64 } };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      system: EXTRACTION_SYSTEM,
      messages: [{
        role: "user",
        content: [
          mediaBlock as any,
          { type: "text", text: "Extract all Asset Management Agreement fields from this document. Return JSON only." },
        ],
      }],
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
      if (match) return NextResponse.json(JSON.parse(match[0]));
      return NextResponse.json({ error: "Could not parse extraction output" }, { status: 500 });
    }
  } catch (e: any) {
    console.error("extract error", e);
    return NextResponse.json({ error: e.message || "Extraction failed" }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

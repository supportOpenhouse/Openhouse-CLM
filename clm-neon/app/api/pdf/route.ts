import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { buildContractModel, stripTokens, ASSET_MANAGER, TEMPLATES } from "@/lib/contract";

async function getBrowser() {
  if (process.env.NODE_ENV === "development") {
    const puppeteer = await import("puppeteer-core");
    return puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome",
      headless: true,
    });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

function escapeHtml(s: string) {
  return (s || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function generateHTML(model: any, templateId: string, formData: any, name: string): string {
  const esc = escapeHtml;
  const clean = (s: string) => esc(stripTokens(s));

  const clausesHTML = model.clauses
    .map(
      (c: any) =>
        `<li><strong>${esc(c.title)}</strong><br/>${clean(c.text).replace(/\n\n/g, "</p><p>")}</li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(name)}</title>
<style>
@page { size: A4; margin: 22mm 20mm; }
body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.55; color: #111; max-width: 720px; margin: 0 auto; padding: 0; }
h1 { font-size: 16pt; text-align: center; font-weight: 700; margin: 8px 0 18px; letter-spacing: 0.02em; }
h2 { font-size: 12pt; font-weight: 700; margin: 18px 0 8px; }
.centered { text-align: center; font-weight: 700; margin: 14px 0; }
p { margin: 8px 0; text-align: justify; }
ol { padding-left: 24px; }
ol li { margin: 12px 0; text-align: justify; }
ol li strong { font-weight: 600; display: inline-block; margin-bottom: 2px; }
.sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; page-break-inside: avoid; }
.sig-line { height: 36px; border-bottom: 1px solid #444; margin: 20px 0 8px; width: 180px; }
.sig-label { font-size: 10pt; font-weight: 600; }
.sig-name { font-size: 10pt; font-weight: 600; margin-top: 2px; }
.sig-role { font-size: 9pt; color: #555; }
.witness { margin-top: 36px; }
.witness-row { display: flex; gap: 32px; margin-top: 10px; }
</style>
</head>
<body>
<h1>ASSET MANAGEMENT AGREEMENT</h1>
<p>${clean(model.preamble)}</p>
<p class="centered">BY AND BETWEEN</p>
<p>${clean(model.ownerParty)}</p>
<p class="centered">AND</p>
<p>M/s ${clean(model.assetManagerParty)}</p>
<p>The "Asset Manager" and the "Owner" are hereinafter collectively referred to as 'Parties' and individually as "Party".</p>
<h2>WHEREAS:</h2>
<p>${clean(model.whereas1)}</p>
<p>${clean(model.whereas2)}</p>
<p>${clean(model.priceBlock)}</p>
<h2>THEREFORE, THE PARTIES HEREBY AGREE AS FOLLOWS:</h2>
<ol>${clausesHTML}</ol>
<p style="margin-top:36px; font-weight:500;">IN WITNESS WHEREOF THE PARTIES HERETO HAVE PUT THEIR HANDS ON THE DAY AND YEAR FIRST HEREINABOVE WRITTEN.</p>
<div class="sig-grid">
  <div>
    <p class="sig-label">For ${esc(ASSET_MANAGER.shortName)} ("Asset Manager")</p>
    <div class="sig-line"></div>
    <p class="sig-name">${esc(ASSET_MANAGER.authorisedSignatory)}</p>
    <p class="sig-role">Authorised Signatory</p>
  </div>
  <div>
    <p class="sig-label">For Owner</p>
    ${formData.owners.map((o: any) => `<div class="sig-line"></div><p class="sig-name">${esc(o.salutation)} ${esc(o.name)}</p>`).join("")}
  </div>
</div>
<div class="witness">
  <p><strong>In the presence of Following witnesses –</strong></p>
  <div class="witness-row">
    <p>1. ${esc(model.witnesses[0] || "______________________")}</p>
    <p>2. ${esc(model.witnesses[1] || "______________________")}</p>
  </div>
</div>
</body>
</html>`;
}

export async function POST(request: Request) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;

  const body = await request.json();
  const { form, templateId, name } = body;
  if (!form || !templateId) {
    return NextResponse.json({ error: "Missing form or templateId" }, { status: 400 });
  }

  const model = buildContractModel(form, templateId);
  const html = generateHTML(model, templateId, form, name || "Agreement");

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "22mm", right: "20mm", bottom: "22mm", left: "20mm" },
    });
    await browser.close();
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${(name || "agreement").replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf"`,
      },
    });
  } catch (e: any) {
    if (browser) await browser.close();
    console.error("pdf error", e);
    return NextResponse.json({ error: e.message || "PDF generation failed" }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

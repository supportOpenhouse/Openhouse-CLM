// ============================================================================
// OPENHOUSE CLM — CONTRACT CORE
// Clause library, templates, token system, Indian number formatters.
// This file is pure logic — ported verbatim from the artifact.
// ============================================================================

export const ASSET_MANAGER = {
  legalName: "Avano Technologies Private Limited",
  shortName: "Avano Technologies Pvt. Ltd.",
  incorporatedOn: "04.07.2024",
  cin: "U68200HR2024PTC123116",
  registeredOffice:
    "VentureX, 2nd Floor, Unit No. 202 & 202A, Silverton Tower, Sector 50, Golf Course Extension Road, Gurugram, Haryana 122018, India",
  authorisedSignatory: "Saurabh Makhariya",
};

// ---- Editable-token helpers ----
const TOK_OPEN = "\uE001";
const TOK_SEP = "\uE002";
const TOK_CLOSE = "\uE003";
export const e = (path: string, display: any) =>
  `${TOK_OPEN}${path}${TOK_SEP}${display == null || display === "" ? "______" : display}${TOK_CLOSE}`;
export const TOKEN_RE = /\uE001([^\uE001\uE003]*?)\uE002([^\uE001\uE003]*?)\uE003/g;
export const stripTokens = (s: string) => (s || "").replace(TOKEN_RE, "$2");

export function getByPath(obj: any, path: string): any {
  if (!path) return undefined;
  const tokens = path.match(/[^.[\]]+/g);
  if (!tokens) return undefined;
  let cur = obj;
  for (const t of tokens) {
    const key = isNaN(Number(t)) ? t : parseInt(t, 10);
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

export function applyPatch(formData: any, patch: Record<string, any>): any {
  const next = JSON.parse(JSON.stringify(formData));
  for (const [path, value] of Object.entries(patch)) {
    if (path === "templateId") continue;
    const tokens = path.match(/[^.[\]]+/g);
    if (!tokens) continue;
    let cur = next;
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i];
      const key = isNaN(Number(t)) ? t : parseInt(t, 10);
      if (cur[key] === undefined || cur[key] === null) {
        cur[key] = isNaN(Number(tokens[i + 1])) ? {} : [];
      }
      cur = cur[key];
    }
    const lastT = tokens[tokens.length - 1];
    const lastKey = isNaN(Number(lastT)) ? lastT : parseInt(lastT, 10);
    cur[lastKey] = value;
  }
  return next;
}

// ---- Indian number formatting ----
export function formatINR(num: any): string {
  if (num === null || num === undefined || num === "") return "______";
  const n = Math.round(Number(num));
  if (isNaN(n)) return "______";
  const s = n.toString();
  if (s.length <= 3) return s;
  const lastThree = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
}

export function toWordsIndian(num: any): string {
  if (num === null || num === undefined || num === "") return "______";
  let n = Math.round(Number(num));
  if (isNaN(n)) return "______";
  if (n === 0) return "Zero";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number): string => {
    if (x < 20) return ones[x];
    const t = Math.floor(x / 10);
    const u = x % 10;
    return tens[t] + (u ? "-" + ones[u] : "");
  };
  const three = (x: number): string => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    let s = "";
    if (h) s += ones[h] + " Hundred";
    if (r) s += (h ? " " : "") + two(r);
    return s;
  };
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;
  if (crore) parts.push(three(crore) + " Crore");
  if (lakh) parts.push(three(lakh) + " Lakh");
  if (thousand) parts.push(three(thousand) + " Thousand");
  if (hundred) parts.push(three(hundred));
  return parts.join(" ").trim();
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function parseAgreementDate(dateStr: string) {
  if (!dateStr) return { day: "__", ordinalDay: "__", month: "____", year: "____", full: "__/__/____" };
  let day: string, month: string, year: string;
  if (dateStr.includes("/")) {
    [day, month, year] = dateStr.split("/").map((s) => s.trim());
  } else if (dateStr.includes("-")) {
    [year, month, day] = dateStr.split("-").map((s) => s.trim());
  } else {
    return { day: "__", ordinalDay: "__", month: "____", year: "____", full: dateStr };
  }
  const months = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  return {
    day: d,
    ordinalDay: ordinal(d),
    month: months[m] || "____",
    year,
    full: `${day}/${month}/${year}`,
  };
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (diff < 5000) return "just now";
  if (diff < 60000) return Math.floor(diff / 1000) + "s ago";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  const days = Math.floor(diff / 86400000);
  if (days < 30) return days + "d ago";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function initialsOf(user: { email?: string | null; displayName?: string | null; display_name?: string | null } | null | undefined): string {
  if (!user) return "?";
  const name = user.displayName || user.display_name || user.email || "?";
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || name).slice(0, 2).toUpperCase();
}

export function avatarColor(email: string | null | undefined): string {
  if (!email) return "#78716c";
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  const palette = [
    "#7a2c38", "#1e40af", "#047857", "#b45309",
    "#6d28d9", "#be185d", "#0369a1", "#15803d",
    "#a16207", "#9f1239", "#1e3a8a", "#064e3b",
  ];
  return palette[h % palette.length];
}

export function formatAuditValue(v: any): string {
  if (v === null || v === undefined) return "(empty)";
  if (typeof v === "number") return formatINR(v);
  if (typeof v === "string") {
    if (v.length > 60) return v.slice(0, 57) + "…";
    return v || "(empty)";
  }
  try {
    const s = JSON.stringify(v);
    return s.length > 60 ? s.slice(0, 57) + "…" : s;
  } catch {
    return String(v);
  }
}

// ============================================================================
// CLAUSE LIBRARY — Every clause's legal text lives here. Renderers interpolate
// values but never modify wording.
// ============================================================================

type ClauseContext = { f: any };

export const CLAUSE_LIBRARY: Record<string, { id: string; title: string; body: (ctx: ClauseContext) => string }> = {
  security_deposit: {
    id: "security_deposit",
    title: "Security Deposit",
    body: ({ f }) =>
      `Upon signing of this agreement, the Asset Manager shall pay an amount of INR ${e(
        "financial.securityDeposit", formatINR(f.financial.securityDeposit)
      )}/- (Indian Rupees ${toWordsIndian(f.financial.securityDeposit)} Only) (including any token amount paid before signing of this agreement) as a "Security Deposit" which shall be refunded in the manner provided in this agreement. This agreement shall be valid only upon realization of the security deposit by the owner.`,
  },
  new_buyer: {
    id: "new_buyer",
    title: "Identification of New Buyer",
    body: () =>
      `The Asset Manager will identify a New Buyer to sell the said Apartment. Such New Buyer will purchase the said Apartment at the Base Price or higher value ("New Sales Consideration") and enter into a direct "Agreement to Sell (ATS)" with the owner, as and when requested by the Asset Manager within the period as mentioned in Clause 8. The owner has understood the above process and has no objection with the same. On signing of the ATS, the Owner shall refund the security deposit to the Asset Manager.`,
  },
  owner_possession: {
    id: "owner_possession",
    title: "Possession & Litigation Warranty",
    body: () =>
      `The Owner represents to the Asset Manager that they have actual, physical and peaceful possession of the said Apartment and that no litigation has been filed/pending or threatened to be filed in respect of the said apartment. If any new litigation is filed or threatened to be filed against the said apartment at any time before the registration of the sale deed, the owner shall duly inform the asset manager and in such event the asset manager shall have the right to terminate this agreement, remove all moveable items deployed by the Asset Manager at the apartment and seek refund of the security deposit. The owner further warrants that upon successful registration of the new sale deed in favour of the New Buyer, the owner shall grant, convey and transfer all their rights, title and interests in the said apartment to the New Buyer.`,
  },
  occupancy_visits: {
    id: "occupancy_visits",
    title: "Occupancy & Buyer Visits",
    body: () =>
      `The Owner further represents that the said apartment is presently occupied by them and that on signing this agreement, the Owner has no objection to the Asset manager in arranging the Visits of the New Buyers. The complete physical handover shall happen only once all payments have been cleared and sale deed is executed with the New Buyer.`,
  },
  occupancy_visits_vacant: {
    id: "occupancy_visits_vacant",
    title: "Vacant Possession & Buyer Visits",
    body: () =>
      `The Owner further represents that the said apartment is presently vacant and lying unoccupied. The Owner has no objection to the Asset Manager in arranging the Visits of the New Buyers and shall provide access to the apartment for marketing and inspection purposes. The complete physical handover shall happen only once all payments have been cleared and sale deed is executed with the New Buyer.`,
  },
  fee_structure: {
    id: "fee_structure",
    title: "Asset Management Fee",
    body: () =>
      `The Parties hereby agree that in lieu of their service, the Asset Manager shall be paid "Asset Management Fee" to be calculated in the following manner:\n\nAsset Management Fees = New Sales Consideration Less Base Price\n\nThe Asset Management Fees shall be payable to the Asset Manager on the date of registration of the sale deed in favor of the New Buyer. The above mentioned Asset Management Fees is inclusive of GST. The Asset Manager will provide a copy of invoice in respect of the Asset Management Fees for their record.`,
  },
  loan_clause: {
    id: "loan_clause",
    title: "Existing Home Loan",
    body: ({ f }) =>
      `The Owner represents that a home loan of approximately INR ${e(
        "loan.outstandingAmount", formatINR(f.loan.outstandingAmount)
      )}/- (Indian Rupees ${toWordsIndian(f.loan.outstandingAmount)} Only) is currently outstanding with ${e(
        "loan.bankName", f.loan.bankName
      )} against the mortgage of the said apartment vide Loan Account No. ${e(
        "loan.loanAccountNo", f.loan.loanAccountNo
      )} in the name of the owner and that there is no overdue amount outstanding against the said Loan. The Owner further represents that they will provide all support including providing all documents for transfer or issuance of a new loan to the New Buyer. In case of difficulty in transfer of loan to the New Buyer, the owner shall repay the loan in full upon payment of the outstanding loan amount by the New Buyer/Asset Manager. The owner further represents that apart from the above-mentioned loan, no charge has been created against the said apartment.`,
  },
  no_loan_clause: {
    id: "no_loan_clause",
    title: "No Encumbrance",
    body: () =>
      `The Owner represents and warrants that the said apartment is free from all encumbrances, mortgages, charges, liens, loans, or any third-party claims whatsoever. No home loan or any other financial facility has been availed against the said apartment. The Owner shall indemnify the Asset Manager against any claims arising from undisclosed encumbrances.`,
  },
  document_handover_with_loan: {
    id: "document_handover_with_loan",
    title: "Original Documents (With Lender)",
    body: () =>
      `The Owner represents that the lending bank has in its possession all original documents related to the apartment and will handover the photocopy of all original documents including Allotment letter, Original Apartments Buyer Agreement, Possession Letter, Payment Receipts, Conveyance Deed, Sale Deed etc. relating to the said property to the Asset manager on receipt of the same from the bank. In case of non availability of the original documents subsequently, the Asset Manager has the right to terminate the agreement and seek refund of the advance paid and expenses incurred in relation to the said apartment.`,
  },
  document_handover_owner: {
    id: "document_handover_owner",
    title: "Original Documents (With Owner)",
    body: () =>
      `The Owner represents that all original documents related to the apartment including Allotment Letter, Apartment Buyer Agreement, Possession Letter, Payment Receipts, Conveyance Deed and Sale Deed are in their custody. The Owner shall handover photocopies of all original documents to the Asset Manager within the timeline specified in Clause 10 and shall produce originals for verification by the New Buyer/Asset Manager as and when required. In case of non-availability of original documents, the Asset Manager has the right to terminate the agreement and seek refund of the advance paid and expenses incurred in relation to the said apartment.`,
  },
  term_and_extension: {
    id: "term_and_extension",
    title: "Term & Extension",
    body: ({ f }) =>
      `If the Asset Manager is unable to source a New Buyer within the initial period of ${e(
        "financial.initialPeriodDays", String(f.financial.initialPeriodDays)
      )} days from the date of Execution of this Agreement or from the date of furnishment of the documents mentioned in clause 10 of this Agreement to the Asset Manager, whichever is Later, in spite of the owner being ready and willing to execute documents in favor of the New Buyer, the agreement shall be extended at the option of the Asset Manager for an additional period of ${e(
        "financial.extensionPeriodDays", String(f.financial.extensionPeriodDays)
      )} days only on payment of INR ${e(
        "financial.monthlyRent", formatINR(f.financial.monthlyRent)
      )}/- (Indian Rupees ${toWordsIndian(f.financial.monthlyRent)} Only) per month as Rent on pro-rata basis till the Execution of Agreement to Sell (ATS) with the New Buyer. If such a situation persists for next ${e(
        "financial.extensionPeriodDays", String(f.financial.extensionPeriodDays)
      )} days, then the owner shall have the option to terminate this Agreement and the owner shall not be liable for any expenses incurred by the Second Party in relation to the improvement expenses in the premises (renovation work) or any other activity carried out during the term of this agreement. However, the Asset Manager will be allowed to remove all the movable items including furniture, appliances, decorative lightings and other decorative items deployed by the Asset Manager at the premises. Upon termination of this Agreement under this clause, the owner shall forfeit paid by the Asset Manager at the time of signing of this agreement and the Asset Manager shall handover the physical possession of the apartment in clean, tenable condition and keys of the said property to the owner without any delay or objection and the owner reserve the full right to retain, sell, or otherwise dispose of the property at its sole discretion, without any obligation to the Asset Manager.`,
  },
  no_parallel_dealings: {
    id: "no_parallel_dealings",
    title: "Exclusivity",
    body: () =>
      `That during the period as mentioned in Clause 8, the owner shall not rent, sell, transfer, or otherwise dispose of the said Apartment. Any unauthorized sale or transfer of the Apartment during the said period shall be considered a breach of this Agreement on part of the owner.`,
  },
  document_furnishment: {
    id: "document_furnishment",
    title: "Document Furnishment",
    body: ({ f }) =>
      `The Owner shall furnish the complete Flat Buyer Agreement, Conveyance Deed no. ${e(
        "documents.conveyanceDeedNo", f.documents.conveyanceDeedNo || "______"
      )}, Possession Certificate dated ${e(
        "documents.possessionCertificateDate", f.documents.possessionCertificateDate || "______"
      )} and Allotment Letter dated ${e(
        "documents.allotmentLetterDate", f.documents.allotmentLetterDate || "______"
      )}, as mentioned in the LOD of the current loan account, to the Asset Manager within ${e(
        "financial.furnishmentDays", String(f.financial.furnishmentDays)
      )} (${toWordsIndian(f.financial.furnishmentDays)}) days from the date of execution of this Agreement. In case of failure to furnish the said document or in case any hindrance arises due to any discrepancy in the said document, which obstructs in the successful completion of the transaction in favor of the New Buyer, the Asset Manager shall have the option to terminate this Agreement. Thereafter, the Owner shall immediately refund all amounts received by him/her till that date along with the refund of all expenses incurred in relation to the said Apartment, simultaneously terminating this Agreement.`,
  },
  specific_performance: {
    id: "specific_performance",
    title: "Specific Performance",
    body: () =>
      `That during the period mentioned above and subject to termination events laid out in the agreement, the owner cannot terminate the agreement and/or refuse to execute an ATS with the New Buyer if the price offered is equal to or more than the Base Price. In the event of any such breach by the owner, the Asset Manager shall have the right to specifically enforce this Agreement through process of law.`,
  },
  confidentiality: {
    id: "confidentiality",
    title: "Confidentiality",
    body: () =>
      `The Parties shall maintain complete secrecy and shall not disclose any confidential matter or communication between themselves to anybody else.`,
  },
  dispute_resolution: {
    id: "dispute_resolution",
    title: "Dispute Resolution",
    body: () =>
      `If any disputes or differences arise between the Parties hereto in connection with this Agreement, the Parties shall endeavor to resolve the same amicably through negotiations. If the dispute is not resolved by means of negotiations within a period of 30 (thirty) days, then such dispute shall be referred to a sole arbitrator who shall jointly be appointed by Asset Manager and the owner. The Arbitration Proceedings shall be governed by the Arbitration & Conciliation Act, 1996 (or any statutory re-enactment thereof, for the time being in force) and shall be in the English language. The seat and the venue of arbitration shall be Gurugram. The award of the Arbitration shall be binding on both the parties.`,
  },
  jurisdiction: {
    id: "jurisdiction",
    title: "Governing Law & Jurisdiction",
    body: () =>
      `This Agreement shall be governed by Indian Laws and the disputes or differences arising under this agreement shall be referred to the courts at Gurugram. The courts at Gurugram shall have exclusive jurisdiction relating to any matter/issue under or pursuant to this Agreement.`,
  },
  force_majeure: {
    id: "force_majeure",
    title: "Force Majeure",
    body: () =>
      `If Asset Manager is prevented, restricted or interfered with by reason of acts of God, war, civil disturbances, fire, flood, cyclone, earthquake, riot, strike, natural calamities, epidemic/pandemic situation, lockdown, non-functioning of Sub-registrar office, epidemic, lockdown or any law or regulation or order of any Government/Competent Authority, or equivalent act or condition whatsoever beyond its reasonable control the Asset Manager affected (unless caused by the acts or omissions of the Asset Manager) (each such occurrence hereinafter referred to as "Force Majeure Event"), then Asset Manager shall have the time extension for completion of its obligations equivalent to the period affected by such prevention, restriction or interference.`,
  },
  auto_termination: {
    id: "auto_termination",
    title: "Automatic Termination",
    body: () =>
      `This Agreement shall automatically stand cancelled upon execution and registration of valid documentation i.e., execution of Registry of the said Apartment in favor of New Buyer and upon making payment of Asset Management Fee by the owner to the Asset Manager.`,
  },
  stamp_duty: {
    id: "stamp_duty",
    title: "Stamp Duty",
    body: () =>
      `Stamp duty and registration charges as may be payable on execution and registration of sale deed/title documents shall be exclusively borne by the New Buyer.`,
  },
  charges_and_levies: {
    id: "charges_and_levies",
    title: "Charges, Taxes & Levies",
    body: () =>
      `All charges, taxes and levies associated with the said Apartment for the period prior to registration of the sale deed (in favor of New Buyer) including builder NOC (if applicable), property tax, maintenance charges, and all other charges shall be paid by the owner and thereafter by the New Buyer. Electricity charges shall be paid by the Asset Manager from the date of key handover as defined in Clause 4 till the date of registration of Sale Deed.`,
  },
};

export const TEMPLATES: Record<string, { id: string; name: string; description: string; flags: { showLoan: boolean; ownerOccupied: boolean }; clauseOrder: string[] }> = {
  standard_with_loan: {
    id: "standard_with_loan",
    name: "Standard AMA — With Existing Loan",
    description: "Residential resale with owner-occupied apartment and an outstanding home loan held by a lender bank.",
    flags: { showLoan: true, ownerOccupied: true },
    clauseOrder: [
      "security_deposit", "new_buyer", "owner_possession", "occupancy_visits", "fee_structure",
      "loan_clause", "document_handover_with_loan", "term_and_extension", "no_parallel_dealings",
      "document_furnishment", "specific_performance", "confidentiality", "dispute_resolution",
      "jurisdiction", "force_majeure", "auto_termination", "stamp_duty", "charges_and_levies",
    ],
  },
  standard_no_loan: {
    id: "standard_no_loan",
    name: "Standard AMA — No Loan",
    description: "Residential resale with owner-occupied apartment, free from all encumbrances.",
    flags: { showLoan: false, ownerOccupied: true },
    clauseOrder: [
      "security_deposit", "new_buyer", "owner_possession", "occupancy_visits", "fee_structure",
      "no_loan_clause", "document_handover_owner", "term_and_extension", "no_parallel_dealings",
      "document_furnishment", "specific_performance", "confidentiality", "dispute_resolution",
      "jurisdiction", "force_majeure", "auto_termination", "stamp_duty", "charges_and_levies",
    ],
  },
  vacant_with_loan: {
    id: "vacant_with_loan",
    name: "Vacant Apartment — With Loan",
    description: "Apartment is unoccupied (investor unit) with an existing home loan against the unit.",
    flags: { showLoan: true, ownerOccupied: false },
    clauseOrder: [
      "security_deposit", "new_buyer", "owner_possession", "occupancy_visits_vacant", "fee_structure",
      "loan_clause", "document_handover_with_loan", "term_and_extension", "no_parallel_dealings",
      "document_furnishment", "specific_performance", "confidentiality", "dispute_resolution",
      "jurisdiction", "force_majeure", "auto_termination", "stamp_duty", "charges_and_levies",
    ],
  },
  vacant_no_loan: {
    id: "vacant_no_loan",
    name: "Vacant Apartment — No Loan",
    description: "Apartment is unoccupied (investor unit), free from all encumbrances.",
    flags: { showLoan: false, ownerOccupied: false },
    clauseOrder: [
      "security_deposit", "new_buyer", "owner_possession", "occupancy_visits_vacant", "fee_structure",
      "no_loan_clause", "document_handover_owner", "term_and_extension", "no_parallel_dealings",
      "document_furnishment", "specific_performance", "confidentiality", "dispute_resolution",
      "jurisdiction", "force_majeure", "auto_termination", "stamp_duty", "charges_and_levies",
    ],
  },
};

// ---- Default forms ----
export const BLANK_FORM = {
  meta: { agreementCode: "", projectCode: "", location: "Gurugram", agreementDate: "" },
  owners: [{ salutation: "Mr.", name: "", relation: "son", relativeSalutation: "Mr.", relativeName: "", pan: "", aadhar: "" }],
  ownerAddress: "",
  property: {
    configuration: "", apartmentNo: "", buildingNo: "", floor: "",
    parkingCount: "", parkingNo: "", superAreaSqFt: "", superAreaSqM: "",
    projectName: "", village: "", sector: "", subTehsil: "",
    district: "Gurugram", state: "Haryana", deedSerialNo: "", deedDate: "",
    bahiSankhyaNo: "", jildNo: "", pagesNo: "",
    addlBahiNo: "", addlJildNo: "", addlPages: "",
  },
  financial: {
    basePrice: 0, securityDeposit: 0, monthlyRent: 22000,
    initialPeriodDays: 120, extensionPeriodDays: 60, furnishmentDays: 15,
  },
  loan: { outstandingAmount: 0, bankName: "", loanAccountNo: "" },
  documents: { conveyanceDeedNo: "", possessionCertificateDate: "", allotmentLetterDate: "" },
  witnesses: ["", ""],
};

// ============================================================================
// CONTRACT MODEL BUILDER
// ============================================================================

function renderOwnerParties(owners: any[], ownerAddress: string): string {
  const parts = owners.map((o, i) => {
    const p = (field: string) => `owners[${i}].${field}`;
    return `${e(p("salutation"), o.salutation || "______")} ${e(p("name"), o.name || "______")}, ${e(p("relation"), o.relation || "______")} of ${e(p("relativeSalutation"), o.relativeSalutation || "______")} ${e(p("relativeName"), o.relativeName || "______")} holding PAN ${e(p("pan"), o.pan || "______")} and Aadhar Number ${e(p("aadhar"), o.aadhar || "______")}`;
  });
  let joined: string;
  if (parts.length === 1) joined = parts[0];
  else if (parts.length === 2) joined = parts.join(" AND ");
  else joined = parts.slice(0, -1).join(", ") + " AND " + parts[parts.length - 1];
  const plural = owners.length > 1 ? "both" : "a";
  const citizenPhrase = owners.length > 1 ? "Resident Indian citizens" : "Resident Indian citizen";
  return `${joined} ${plural} ${citizenPhrase} residing at ${e("ownerAddress", ownerAddress || "______")} (hereinafter referred to as "Owner"), which expression shall, unless it be repugnant to the context or meaning thereof, be deemed to mean and include their respective heirs, successors, representatives, executors, legal representatives, nominees and assigns) of the FIRST PART.`;
}

export function buildContractModel(formData: any, templateId: string) {
  const template = TEMPLATES[templateId];
  const f = formData;
  const date = parseAgreementDate(f.meta.agreementDate);

  const preamble = `This Asset Management Agreement ("Agreement") is made and executed at ${e("meta.location", f.meta.location || "______")} on the ${e("meta.agreementDate", `${date.ordinalDay} day of ${date.month} ${date.year}`)}.`;

  const ownerParty = renderOwnerParties(f.owners, f.ownerAddress);
  const assetManagerParty = `${ASSET_MANAGER.legalName}, a Private Limited Company incorporated on ${ASSET_MANAGER.incorporatedOn} in accordance with the provisions of the Companies Act, 2013, having CIN ${ASSET_MANAGER.cin} having its registered office at ${ASSET_MANAGER.registeredOffice} acting through its Authorised Signatory Mr. ${ASSET_MANAGER.authorisedSignatory} (hereinafter referred to as "Asset Manager" which expression shall unless excluded by or repugnant to the context or meaning thereof, be deemed to mean and include its successors and assigns) of the SECOND PART.`;

  const p = f.property;
  const P = (field: string, display: any) => e(`property.${field}`, display || "______");
  const whereas1 = `The owner is the rightful owner of the complete rights in respect of the Residential Apartment with configuration ${P("configuration", p.configuration)} bearing no. ${P("apartmentNo", p.apartmentNo)} located in Building No. ${P("buildingNo", p.buildingNo)} on ${P("floor", p.floor)} Floor along with ${P("parkingCount", p.parkingCount)} Designated Covered Car Parking Space No. ${P("parkingNo", p.parkingNo)}, ad-measuring Super Area ${P("superAreaSqFt", p.superAreaSqFt)} sq feet (${P("superAreaSqM", p.superAreaSqM)} Sq Mtrs.) at "${P("projectName", p.projectName)}" situated in village ${P("village", p.village)}, now falling in Sector-${P("sector", p.sector)}, Sub-Tehsil ${P("subTehsil", p.subTehsil)}, District ${P("district", p.district)}, ${P("state", p.state)} along with right to use the common areas, amenities & facilities to be provided in the said Project along with all manner of rights, privileges, easement, advantage, appendages and appurtenances whatsoever of the said Property together with proportionate common facilities of building/block with proportionate share in land underneath (hereinafter called the "Apartment") and is well and sufficiently entitled to further transfer the complete rights in terms of the rights granted under the Sale/Conveyance Deed registered under serial no. ${P("deedSerialNo", p.deedSerialNo)}, dated ${P("deedDate", p.deedDate)}, Bahi Sankhya No. ${P("bahiSankhyaNo", p.bahiSankhyaNo)}, Jild No. ${P("jildNo", p.jildNo)}, Pages No. ${P("pagesNo", p.pagesNo)} and an additional copy of which is affixed on Bahi Sankhya no. ${P("addlBahiNo", p.addlBahiNo)} Jild no. ${P("addlJildNo", p.addlJildNo)}, pages ${P("addlPages", p.addlPages)}.`;

  const whereas2 = `The Asset Manager is in the business of asset management and enhancing the saleability and speedy disposal of residential properties and making real estate investments, if needed. The Asset Manager has, based on the representations, covenants, and warranties of the owner, agreed to act as an exclusive Asset Manager of the said apartment and the Parties have accordingly agreed to enter into this Agreement for the said Apartment on terms and conditions hereinafter recorded.`;

  const priceBlock = `For the purposes of this agreement, price of the apartment has been fixed at INR ${e("financial.basePrice", formatINR(f.financial.basePrice))}/- (Indian Rupees ${toWordsIndian(f.financial.basePrice)} Only) (known hereinafter as "Base Price"). The Base Price includes Basic Sale Price, IDC (Infrastructure Development Charges) and EDC (External Development Charges), One Car Parking, Club Membership, VAT, IFMS (Interest Free Maintenance Security Deposit), Advance Maintenance (whatever the Amount lying with the Maintenance Agency till the date of transfer) or any other charges till the date of registry with all fixtures and fittings installed therein.`;

  const clauses = template.clauseOrder.map((id) => {
    const c = CLAUSE_LIBRARY[id];
    return { id, title: c.title, text: c.body({ f }) };
  });

  return {
    preamble, ownerParty, assetManagerParty,
    whereas1, whereas2, priceBlock, clauses,
    witnesses: f.witnesses,
  };
}

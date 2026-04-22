export const PATH_META: Record<string, { label: string; hint?: string; isNumber?: boolean; multiline?: boolean; options?: { value: string; label: string }[] }> = {
  "meta.agreementCode": { label: "AMA Code", hint: "e.g. A100101" },
  "meta.projectCode": { label: "Project Code / Name" },
  "meta.location": { label: "Execution Location" },
  "meta.agreementDate": { label: "Agreement Date", hint: "DD/MM/YYYY" },
  ownerAddress: { label: "Owner(s) Residential Address", multiline: true },
  "financial.basePrice": { label: "Base Price (₹)", isNumber: true, hint: "Accepts 1.2 cr, 95 lakh, etc." },
  "financial.securityDeposit": { label: "Security Deposit (₹)", isNumber: true, hint: "Accepts 95k, 1 lakh" },
  "financial.monthlyRent": { label: "Monthly Rent (₹)", isNumber: true },
  "financial.initialPeriodDays": { label: "Initial Period (days)", isNumber: true },
  "financial.extensionPeriodDays": { label: "Extension Period (days)", isNumber: true },
  "financial.furnishmentDays": { label: "Document Furnishment (days)", isNumber: true },
  "loan.outstandingAmount": { label: "Outstanding Loan (₹)", isNumber: true },
  "loan.bankName": { label: "Bank Name" },
  "loan.loanAccountNo": { label: "Loan Account No." },
  "documents.conveyanceDeedNo": { label: "Conveyance Deed No." },
  "documents.possessionCertificateDate": { label: "Possession Certificate Date", hint: "DD.MM.YYYY" },
  "documents.allotmentLetterDate": { label: "Allotment Letter Date", hint: "DD.MM.YYYY" },
  "property.configuration": { label: "Configuration", hint: "2BHK / 3BHK" },
  "property.apartmentNo": { label: "Apartment No." },
  "property.buildingNo": { label: "Building No." },
  "property.floor": { label: "Floor" },
  "property.parkingCount": { label: "Parking Count" },
  "property.parkingNo": { label: "Parking No." },
  "property.superAreaSqFt": { label: "Super Area (sq ft)" },
  "property.superAreaSqM": { label: "Super Area (sq m)" },
  "property.projectName": { label: "Project Name" },
  "property.village": { label: "Village(s)" },
  "property.sector": { label: "Sector" },
  "property.subTehsil": { label: "Sub-Tehsil" },
  "property.district": { label: "District" },
  "property.state": { label: "State" },
  "property.deedSerialNo": { label: "Deed Serial No." },
  "property.deedDate": { label: "Deed Date", hint: "DD.MM.YYYY" },
  "property.bahiSankhyaNo": { label: "Bahi Sankhya No." },
  "property.jildNo": { label: "Jild No." },
  "property.pagesNo": { label: "Pages No." },
  "property.addlBahiNo": { label: "Addl. Bahi No." },
  "property.addlJildNo": { label: "Addl. Jild No." },
  "property.addlPages": { label: "Addl. Pages" },
};

export function metaForPath(path: string) {
  if (PATH_META[path]) return PATH_META[path];
  const owner = path.match(/^owners\[(\d+)\]\.(\w+)$/);
  if (owner) {
    const idx = parseInt(owner[1], 10);
    const field = owner[2];
    const n = idx + 1;
    if (field === "salutation") {
      return { label: `Owner ${n} — Salutation`, options: [{ value: "Mr.", label: "Mr." }, { value: "Mrs.", label: "Mrs." }, { value: "Ms.", label: "Ms." }] };
    }
    if (field === "relation") {
      return { label: `Owner ${n} — Relation`, options: [{ value: "son", label: "son of" }, { value: "daughter", label: "daughter of" }, { value: "wife", label: "wife of" }, { value: "husband", label: "husband of" }] };
    }
    if (field === "relativeSalutation") {
      return { label: `Owner ${n} — Relative Salutation`, options: [{ value: "Mr.", label: "Mr." }, { value: "Mrs.", label: "Mrs." }, { value: "late Mr.", label: "late Mr." }] };
    }
    const fieldLabels: Record<string, string> = { name: "Full Name", relativeName: "Relative's Name", pan: "PAN", aadhar: "Aadhar" };
    return { label: `Owner ${n} — ${fieldLabels[field] || field}` };
  }
  const witness = path.match(/^witnesses\[(\d+)\]$/);
  if (witness) {
    const n = parseInt(witness[1], 10) + 1;
    return { label: `Witness ${n}` };
  }
  return { label: path };
}

export const AUDIT_LABELS: Record<string, string> = {
  field_edit: "edited a field",
  bulk_update: "made bulk updates",
  template_change: "changed template",
  rename_agreement: "renamed agreement",
  version_saved: "saved version",
  version_restored: "restored version",
  version_deleted: "deleted version",
  version_renamed: "renamed version",
  submit_review: "submitted for review",
  approve: "approved version",
  reject: "rejected version",
  clear_form: "cleared form",
  load_sample: "loaded sample",
  created: "created agreement",
};

export function auditActionLabel(action: string) {
  return AUDIT_LABELS[action] || action.replace(/_/g, " ");
}

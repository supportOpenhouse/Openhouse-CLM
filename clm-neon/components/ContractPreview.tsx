"use client";

import Tokenized from "./Tokenized";
import { ASSET_MANAGER, e } from "@/lib/contract";

export default function ContractPreview({
  model,
  template,
  agreementCode,
  projectCode,
  owners,
  recentChanges,
  onEditRequest,
  editingPath,
}: {
  model: any;
  template: { name: string };
  agreementCode: string;
  projectCode: string;
  owners: any[];
  recentChanges: Map<string, number>;
  onEditRequest: (path: string, target: HTMLElement) => void;
  editingPath?: string | null;
}) {
  const T = (text: string) => (
    <Tokenized text={text} recentChanges={recentChanges} onEditRequest={onEditRequest} editingPath={editingPath} />
  );

  return (
    <div className="contract-paper">
      <div className="contract-head">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "#78716c" }}>
              Openhouse · Asset Management Agreement
            </div>
            <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 2 }}>
              Template: {template.name}
              {agreementCode ? ` · AMA ${agreementCode}` : ""}
              {projectCode ? ` · ${projectCode}` : ""}
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#a8a29e" }}>DRAFT · click any highlighted value to edit</div>
        </div>
      </div>

      <div className="contract-body">
        <h1 className="contract-title">ASSET MANAGEMENT AGREEMENT</h1>
        <p className="contract-para">{T(model.preamble)}</p>

        <p className="contract-centered">BY AND BETWEEN</p>
        <p className="contract-para">{T(model.ownerParty)}</p>

        <p className="contract-centered">AND</p>
        <p className="contract-para">M/s {T(model.assetManagerParty)}</p>

        <p className="contract-para">
          The "Asset Manager" and the "Owner" are hereinafter collectively referred to as 'Parties' and individually as "Party".
        </p>

        <h2 className="contract-h2">WHEREAS:</h2>
        <p className="contract-para">{T(model.whereas1)}</p>
        <p className="contract-para">{T(model.whereas2)}</p>
        <p className="contract-para">{T(model.priceBlock)}</p>

        <h2 className="contract-h2">THEREFORE, THE PARTIES HEREBY AGREE AS FOLLOWS:</h2>

        <ol className="contract-clauses">
          {model.clauses.map((c: any, i: number) => (
            <li key={c.id} className="contract-clause">
              <span className="clause-num">{i + 1}.</span>
              <div>
                <div className="clause-title">{c.title}</div>
                {c.text.split("\n\n").map((para: string, j: number) => (
                  <p key={j} className="clause-text">{T(para)}</p>
                ))}
              </div>
            </li>
          ))}
        </ol>

        <p className="contract-para" style={{ marginTop: 32, fontWeight: 500 }}>
          IN WITNESS WHEREOF THE PARTIES HERETO HAVE PUT THEIR HANDS ON THE DAY AND YEAR FIRST HEREINABOVE WRITTEN.
        </p>

        <div className="signature-grid">
          <div>
            <p className="sig-label">For {ASSET_MANAGER.shortName} ("Asset Manager")</p>
            <div className="sig-line" />
            <p className="sig-name">{ASSET_MANAGER.authorisedSignatory}</p>
            <p className="sig-role">Authorised Signatory</p>
          </div>
          <div>
            <p className="sig-label">For Owner</p>
            <div className="sig-owners">
              {owners.map((o, i) => (
                <div key={i} className="sig-owner">
                  <div className="sig-line" />
                  <p className="sig-name">
                    <Tokenized
                      text={`${e(`owners[${i}].salutation`, o.salutation || "______")} ${e(`owners[${i}].name`, o.name || "______________________")}`}
                      recentChanges={recentChanges}
                      onEditRequest={onEditRequest}
                      editingPath={editingPath}
                    />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="witness-block">
          <p className="witness-heading">In the presence of Following witnesses –</p>
          <div className="witness-grid">
            <div>
              <span className="witness-num">1.</span>
              <span className="witness-name">
                <Tokenized
                  text={e("witnesses[0]", model.witnesses[0] || "______________________")}
                  recentChanges={recentChanges}
                  onEditRequest={onEditRequest}
                  editingPath={editingPath}
                />
              </span>
            </div>
            <div>
              <span className="witness-num">2.</span>
              <span className="witness-name">
                <Tokenized
                  text={e("witnesses[1]", model.witnesses[1] || "______________________")}
                  recentChanges={recentChanges}
                  onEditRequest={onEditRequest}
                  editingPath={editingPath}
                />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

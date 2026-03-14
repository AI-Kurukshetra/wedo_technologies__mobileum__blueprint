import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    data: [
      {
        id: "regulatory_summary",
        name: "Regulatory Summary",
        description: "High-level alerts, cases, CDR volume, and reconciliation activity for regulator-facing submissions."
      },
      {
        id: "compliance_audit",
        name: "Compliance Audit Trail",
        description: "Detailed audit log of security and workflow events for internal or external audits."
      }
    ]
  });
}

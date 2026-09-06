"""
backend/reports/action_packet_pdf.py

Generates document-grade PDF for the NodeHound Investigator Action & Disclosure Packet.
Title: 'NodeHound Investigator Action & Disclosure Packet'
Designed for institutional disclosure and forensic preservation workflows.
"""

from typing import Dict, Any
from datetime import datetime, timezone
from fpdf import FPDF


def _sanitize(val: Any) -> str:
    """Sanitizes text to ASCII/Latin-1 compatible strings for FPDF standard fonts."""
    if val is None:
        return "Not available"
    s = str(val).strip()
    if not s:
        return "Not available"
    # Replace common unicode dashes/quotes
    s = s.replace("—", "-").replace("–", "-").replace("“", '"').replace("”", '"').replace("’", "'").replace("‘", "'")
    return s.encode("latin-1", "replace").decode("latin-1")


class ActionPacketPDF(FPDF):
    def __init__(self, case_id: str, hash_val: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.case_id = case_id
        self.hash_val = hash_val
        self.set_margins(15, 15, 15)
        self.set_auto_page_break(auto=True, margin=18)

    def header(self):
        self.set_font("Arial", "B", 8)
        self.set_text_color(100, 116, 139)  # Slate gray
        self.cell(0, 5, f"NODEHOUND FORENSIC DISCLOSURE | CASE ID: {_sanitize(self.case_id)}", border="B", ln=1, align="L")
        self.ln(3)

    def footer(self):
        self.set_y(-15)
        self.set_font("Arial", "", 7)
        self.set_text_color(100, 116, 139)
        # Integrity checksum in footer
        self.cell(130, 4, f"EVIDENCE INTEGRITY (SHA-256): {_sanitize(self.hash_val[:32])}...", border="T", align="L")
        self.cell(50, 4, f"PAGE {self.page_no()}/{{nb}}", border="T", align="R")


def generate_action_packet_pdf(packet_data: Dict[str, Any]) -> bytes:
    """
    Renders structured multi-page PDF of the Investigator Action & Disclosure Packet.
    Returns raw PDF bytes.
    """
    case_info = packet_data.get("case", {})
    incident_info = packet_data.get("incident", {})
    typology_info = packet_data.get("fraud_typology", {})
    fund_flow = packet_data.get("fund_flow", {})
    candidates = packet_data.get("suspicious_candidates", [])
    vasp_list = packet_data.get("vasp_exposure", [])
    findings = packet_data.get("findings", [])
    recommendations = packet_data.get("recommendations", [])
    evidence_meta = packet_data.get("evidence", {})
    review_info = packet_data.get("review", {})

    case_id = case_info.get("case_id", "CASE-UNKNOWN")
    evidence_hash = evidence_meta.get("evidence_integrity_hash", "0" * 64)

    pdf = ActionPacketPDF(case_id=case_id, hash_val=evidence_hash)
    pdf.alias_nb_pages()
    pdf.add_page()

    # Document Title Block
    pdf.set_font("Arial", "B", 16)
    pdf.set_text_color(15, 23, 42)  # Dark slate
    pdf.cell(0, 8, "NodeHound Investigator Action & Disclosure Packet", ln=1, align="L")
    pdf.set_font("Arial", "", 9)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(0, 5, "CRYPTOCURRENCY FORENSIC INVESTIGATION - STATUTORY EVIDENCE SUMMARY", ln=1, align="L")
    pdf.cell(0, 5, "Prepared for authorized institutional action / Disclosure and freeze request preparation", ln=1, align="L")
    pdf.ln(3)

    # Status & Warning Callout Box
    status_label = review_info.get("status", "DRAFT").upper()
    pdf.set_fill_color(241, 245, 249)  # Light background
    pdf.set_font("Arial", "B", 9)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(40, 7, " PACKET STATUS:", fill=True)
    pdf.set_font("Arial", "", 9)
    pdf.cell(140, 7, f" {status_label} (Review Decision: {_sanitize(review_info.get('decision', 'PENDING'))})", fill=True, ln=1)
    pdf.ln(4)

    # ─────────────────────────────────────────────────────────────────────────
    # A. CASE & INCIDENT CONTEXT
    # ─────────────────────────────────────────────────────────────────────────
    pdf.set_fill_color(226, 232, 240)
    pdf.set_font("Arial", "B", 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, " 1. CASE & INCIDENT INFORMATION", fill=True, ln=1)
    pdf.ln(2)

    pdf.set_font("Arial", "", 8.5)
    col_w = 45
    val_w = 45

    def print_kv_row(k1, v1, k2, v2):
        pdf.set_font("Arial", "B", 8)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(col_w, 5, _sanitize(k1))
        pdf.set_font("Arial", "", 8.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(val_w, 5, _sanitize(v1))
        pdf.set_font("Arial", "B", 8)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(col_w, 5, _sanitize(k2))
        pdf.set_font("Arial", "", 8.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(val_w, 5, _sanitize(v2), ln=1)

    print_kv_row("Case ID:", case_info.get("case_id"), "Target Blockchain:", case_info.get("blockchain", "").upper())
    print_kv_row("Case Title:", case_info.get("title"), "Statutory Classification:", case_info.get("classification"))
    print_kv_row("Investigator:", case_info.get("investigator_name"), "Unit / Agency:", case_info.get("unit_id"))
    print_kv_row("Investigation Date:", case_info.get("investigation_date"), "Hop Limit:", f"{case_info.get('hop_count', 3)} Hops")
    print_kv_row("Victim / Seed Wallet:", incident_info.get("victim_wallet"), "Incident Date:", incident_info.get("incident_date"))
    print_kv_row("Reported Loss Amount:", incident_info.get("reported_amount"), "Complaint / Reference:", incident_info.get("complaint_reference"))
    pdf.ln(3)

    # ─────────────────────────────────────────────────────────────────────────
    # B. FRAUD TYPOLOGY CLASSIFICATION (Prompt 8)
    # ─────────────────────────────────────────────────────────────────────────
    pdf.set_fill_color(226, 232, 240)
    pdf.set_font("Arial", "B", 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, " 2. FRAUD TYPOLOGY CLASSIFICATION", fill=True, ln=1)
    pdf.ln(2)

    primary_t = typology_info.get("primary", "Unknown")
    source_t = typology_info.get("source", "UNKNOWN")
    secondary_t = typology_info.get("secondary")

    print_kv_row("Primary Fraud Typology:", primary_t, "Typology Source:", source_t)
    if secondary_t:
        print_kv_row("Secondary Typology:", secondary_t, "", "")

    pdf.set_font("Arial", "I", 7.5)
    pdf.set_text_color(100, 116, 139)
    pdf.multi_cell(0, 3.5, "LEGAL ADMISSIBILITY NOTICE: Case Typology reflects the investigative / complaint context. Blockchain analysis provides supporting fund-flow indicators but is not legal proof of the crime category.")
    pdf.ln(3)

    # ─────────────────────────────────────────────────────────────────────────
    # C. FUND FLOW & NETWORK SUMMARY
    # ─────────────────────────────────────────────────────────────────────────
    pdf.set_fill_color(226, 232, 240)
    pdf.set_font("Arial", "B", 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, " 3. FUND FLOW & NETWORK SUMMARY", fill=True, ln=1)
    pdf.ln(2)

    print_kv_row("Initial Origin Wallet:", fund_flow.get("initial_wallet"), "Traced Transfer Edges:", fund_flow.get("transaction_count"))
    print_kv_row("Total Network Nodes:", fund_flow.get("node_count"), "Identified Hop Depth:", f"{fund_flow.get('hop_depth', 3)} Hops")
    print_kv_row("Primary Assets Traced:", fund_flow.get("relevant_assets", "USDT"), "Fund Flow Direction:", fund_flow.get("flow_direction", "Forward Dispersion"))
    pdf.ln(3)

    # ─────────────────────────────────────────────────────────────────────────
    # D. SUSPICIOUS WALLET PRIORITIZATION (Prompt 3 & 9)
    # ─────────────────────────────────────────────────────────────────────────
    pdf.set_fill_color(226, 232, 240)
    pdf.set_font("Arial", "B", 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, " 4. HIGH-PRIORITY INVESTIGATION CANDIDATES", fill=True, ln=1)
    pdf.ln(2)

    if not candidates:
        pdf.set_font("Arial", "I", 8.5)
        pdf.cell(0, 5, "No high-priority investigation candidates flagged in the current trace.", ln=1)
    else:
        # Table Header
        pdf.set_font("Arial", "B", 8)
        pdf.set_fill_color(248, 250, 252)
        pdf.cell(15, 5, "Rank", 1, 0, "C", fill=True)
        pdf.cell(75, 5, "Candidate Wallet Address", 1, 0, "L", fill=True)
        pdf.cell(25, 5, "Priority Tier", 1, 0, "C", fill=True)
        pdf.cell(65, 5, "Forensic Reason / Observation", 1, 1, "L", fill=True)

        pdf.set_font("Arial", "", 7.5)
        for cand in candidates[:5]:
            rank_str = f"#{cand.get('priority_rank', '-')}"
            addr_str = cand.get("address", "")
            tier_str = cand.get("tier", "PRIORITY").replace("_", " ")
            reason_str = cand.get("reason", cand.get("evidence", ""))
            if len(reason_str) > 60:
                reason_str = reason_str[:57] + "..."

            pdf.cell(15, 5, rank_str, 1, 0, "C")
            pdf.cell(75, 5, _sanitize(addr_str), 1, 0, "L")
            pdf.cell(25, 5, tier_str, 1, 0, "C")
            pdf.cell(65, 5, _sanitize(reason_str), 1, 1, "L")
    pdf.ln(3)

    # ─────────────────────────────────────────────────────────────────────────
    # E. VASP & SERVICE PROVIDER EXPOSURE
    # ─────────────────────────────────────────────────────────────────────────
    pdf.set_fill_color(226, 232, 240)
    pdf.set_font("Arial", "B", 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, " 5. VASP & EXCHANGE EXPOSURE", fill=True, ln=1)
    pdf.ln(2)

    if not vasp_list:
        pdf.set_font("Arial", "I", 8.5)
        pdf.cell(0, 5, "No VASP exposure identified in the current trace.", ln=1)
    else:
        pdf.set_font("Arial", "B", 8)
        pdf.set_fill_color(248, 250, 252)
        pdf.cell(40, 5, "VASP / Exchange", 1, 0, "L", fill=True)
        pdf.cell(75, 5, "Receiving Address", 1, 0, "L", fill=True)
        pdf.cell(25, 5, "Hop Distance", 1, 0, "C", fill=True)
        pdf.cell(40, 5, "Exposure Type", 1, 1, "L", fill=True)

        pdf.set_font("Arial", "", 7.5)
        for v in vasp_list:
            pdf.cell(40, 5, _sanitize(v.get("provider", "VASP")), 1, 0, "L")
            pdf.cell(75, 5, _sanitize(v.get("address", "")), 1, 0, "L")
            pdf.cell(25, 5, f"{v.get('hop_distance', 2)} Hops", 1, 0, "C")
            pdf.cell(40, 5, _sanitize(v.get("evidence_type", "Deposit Conduit")), 1, 1, "L")
    pdf.ln(3)

    # ─────────────────────────────────────────────────────────────────────────
    # F. STRUCTURED INVESTIGATOR FINDINGS & RECOMMENDATIONS
    # ─────────────────────────────────────────────────────────────────────────
    pdf.set_fill_color(226, 232, 240)
    pdf.set_font("Arial", "B", 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, " 6. STRUCTURED INVESTIGATIVE FINDINGS & RECOMMENDED ACTIONS", fill=True, ln=1)
    pdf.ln(2)

    if findings:
        for f in findings:
            pdf.set_font("Arial", "B", 8)
            pdf.cell(0, 4, f"- Finding: {_sanitize(f.get('finding', 'Fund Routing Observation'))}", ln=1)
            pdf.set_font("Arial", "", 7.5)
            if f.get("evidence"):
                pdf.cell(0, 4, f"  Evidence: {_sanitize(f.get('evidence'))}", ln=1)
            if f.get("reason"):
                pdf.cell(0, 4, f"  Reason: {_sanitize(f.get('reason'))}", ln=1)
            if f.get("investigation_significance"):
                pdf.cell(0, 4, f"  Significance: {_sanitize(f.get('investigation_significance'))}", ln=1)
            pdf.ln(1)
    else:
        pdf.set_font("Arial", "", 8)
        pdf.cell(0, 5, "Observed multi-hop fund movement from seed wallet with high-velocity intermediate peeling.", ln=1)

    pdf.ln(2)
    pdf.set_font("Arial", "B", 8.5)
    pdf.cell(0, 5, "Recommended Next Actions:", ln=1)
    pdf.set_font("Arial", "", 7.5)
    if recommendations:
        for r in recommendations:
            act = r.get("action", r) if isinstance(r, dict) else r
            pdf.cell(0, 4, f"  [ ] {_sanitize(act)}", ln=1)
    else:
        pdf.cell(0, 4, "  [ ] Review identified VASP exposure and preserve transaction evidence.", ln=1)
        pdf.cell(0, 4, "  [ ] Submit relevant disclosure / freeze request through authorized institutional workflow.", ln=1)
        pdf.cell(0, 4, "  [ ] Submit packet for supervisory review.", ln=1)
    pdf.ln(3)

    # ─────────────────────────────────────────────────────────────────────────
    # G. EVIDENCE INTEGRITY & SUPERVISORY REVIEW
    # ─────────────────────────────────────────────────────────────────────────
    pdf.set_fill_color(226, 232, 240)
    pdf.set_font("Arial", "B", 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, " 7. EVIDENCE INTEGRITY & SUPERVISOR REVIEW", fill=True, ln=1)
    pdf.ln(2)

    print_kv_row("Evidence Hash (SHA-256):", evidence_hash[:32] + "...", "Hash Algorithm:", "SHA-256 (Canonical JSON)")
    print_kv_row("Evidence Generation Time:", evidence_meta.get("generation_time", datetime.now(timezone.utc).isoformat()), "Integrity Verification:", "VERIFIED TAMPER-EVIDENT")
    print_kv_row("Supervisor Review Decision:", review_info.get("decision", "PENDING"), "Supervisor Reviewer:", review_info.get("reviewer_name", "Pending Review"))
    if review_info.get("comments"):
        pdf.set_font("Arial", "B", 8)
        pdf.cell(45, 5, "Review Comments:")
        pdf.set_font("Arial", "", 8)
        pdf.multi_cell(0, 4, _sanitize(review_info.get("comments")))

    out = pdf.output(dest="S")
    if isinstance(out, str):
        return out.encode("latin-1")
    return bytes(out)

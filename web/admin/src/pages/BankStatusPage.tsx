import type { AdminApi } from "../api";
import { BankStatus } from "../bank/BankStatus";

// A10 bank status (D §D8.5; Phase 42, M3-07): R30 `GET /api/admin/bank-status`, worded by web/admin/src/bank/.

export function BankStatusPage({ api }: { readonly api: AdminApi }) {
  return <BankStatus api={api} />;
}

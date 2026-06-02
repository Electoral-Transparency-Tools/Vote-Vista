/** Format an INR amount into a compact Indian-style string (Lakh/Crore). */
export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not declared";
  if (value === 0) return "₹0";
  const crore = 1_00_00_000;
  const lakh = 1_00_000;
  if (value >= crore) return `₹${(value / crore).toFixed(2)} Cr`;
  if (value >= lakh) return `₹${(value / lakh).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export function partyColor(partyShort: string): string {
  const map: Record<string, string> = {
    BJP: "#f97316",
    INC: "#22c55e",
    AAP: "#0ea5e9",
    BSP: "#2563eb",
    NOTA: "#64748b",
    IND: "#a855f7",
  };
  return map[partyShort] ?? "#94a3b8";
}

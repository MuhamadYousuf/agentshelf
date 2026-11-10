"use client";

import { useEffect, useState } from "react";

function money(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== "string" || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())) return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount)
    : fallback;
}

export function MandateSummary() {
  const [summary, setSummary] = useState("Your agent can spend up to $50 per order and $200 in total. Orders over $40 will ask you first.");

  useEffect(() => {
    const form = document.getElementById("pass-create-form");
    if (!(form instanceof HTMLFormElement)) return;

    const updateSummary = () => {
      const values = new FormData(form);
      const expiryDays = Number(values.get("expiresDays"));
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (expiryDays === 1 || expiryDays === 7 || expiryDays === 30 ? expiryDays : 7));
      const until = expiryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const perOrder = money(values.get("perOrderMax"), "$50");
      const budget = money(values.get("totalBudget"), "$200");
      const stepUp = money(values.get("stepUpOver"), "$40");
      setSummary("Your agent can spend up to " + perOrder + " per order and " + budget + " in total until " + until + ". Orders over " + stepUp + " will ask you first.");
    };

    form.addEventListener("input", updateSummary);
    form.addEventListener("change", updateSummary);
    updateSummary();
    return () => {
      form.removeEventListener("input", updateSummary);
      form.removeEventListener("change", updateSummary);
    };
  }, []);

  return <p className="pass-live-summary" aria-live="polite">{summary}</p>;
}

"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type CsvValue = string | number | null | undefined;

type Props = {
  filename: string;
  rows: Record<string, CsvValue>[];
  label?: string;
};

function toCell(value: CsvValue) {
  const normalized = value === null || value === undefined ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function CsvExportButton({ filename, rows, label = "Export CSV" }: Props) {
  const handleExport = () => {
    if (!rows.length) {
      return;
    }

    const headers = Object.keys(rows[0]);
    const lines = [
      headers.map(toCell).join(","),
      ...rows.map((row) => headers.map((header) => toCell(row[header])).join(","))
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Button type="button" variant="outline" onClick={handleExport} disabled={!rows.length}>
      <Download className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
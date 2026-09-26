"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/client";
import { MAPPING_FIELDS, type ColumnMapping } from "@/lib/results/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ImportSummary {
  data: string;
  arquivo: string;
  total: number;
  reconhecidas: number;
  naoReconhecidas: number;
}

export function ImportPanel({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [totalRows, setTotalRows] = useState(0);
  const [history, setHistory] = useState<ImportSummary[]>([]);

  useEffect(() => {
    api.listResultsImports().then(({ imports }) => setHistory(imports)).catch(() => {});
  }, []);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const { headers, mapping, totalRows } = await api.inspectResultsCsv(text);
      setCsvText(text);
      setFilename(file.name);
      setHeaders(headers);
      setMapping(mapping);
      setTotalRows(totalRows);
    } catch (e: any) {
      toast.error(`Failed to read CSV: ${e.message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const ready = !!(mapping.nome_anuncio && mapping.gasto && mapping.impressoes);

  async function confirmImport() {
    if (!csvText || !ready) return;
    setBusy(true);
    try {
      const res = await api.importResultsCsv(csvText, mapping as ColumnMapping, filename);
      toast.success(`${res.reconhecidas} of ${res.total} ads matched`);
      setCsvText(null);
      setHeaders([]);
      setMapping({});
      const { imports } = await api.listResultsImports();
      setHistory(imports);
      onImported();
    } catch (e: any) {
      toast.error(`Failed to import: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-secondary/20 p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Export the CSV from Meta Ads Manager and import it here. The tool matches each
          ad by its filename (with the <code>_v...</code> code) and adds up with previous
          imports — import again whenever you like.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files)}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          choose CSV
        </Button>
      </div>

      {csvText && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {filename} — {totalRows} row(s)
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            column mapping (auto-detected — correct it if needed)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MAPPING_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label>
                  {f.label} {f.required && <span className="text-primary">*</span>}
                </Label>
                <Select
                  value={mapping[f.key] || "__none__"}
                  onValueChange={(v) =>
                    setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? undefined : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="choose column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— none —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button onClick={confirmImport} disabled={!ready || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            import
          </Button>
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-border">
          <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Imports
          </div>
          {history.map((h, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm last:border-0"
            >
              <div>
                <div className="font-medium">{h.arquivo}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(h.data).toLocaleString("en-US")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {h.reconhecidas} matched
                </Badge>
                {h.naoReconhecidas > 0 && (
                  <Badge variant="warn">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    {h.naoReconhecidas} unmatched
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

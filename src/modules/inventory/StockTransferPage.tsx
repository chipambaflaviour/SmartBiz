import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/shared/lib/supabase";
import { useAppStore } from "@/shared/stores/appStore";
import { Button } from "@/shared/components/ui/Button";
import {
  Card,
  BackButton,
  EmptyState,
  Table,
  Td,
  Th,
  Thead,
  Tr,
} from "@/shared/components/ui/Display";
import {
  FormField,
  Input,
  Select,
  Textarea,
} from "@/shared/components/ui/FormElements";
export default function StockTransferPage() {
  const org = useAppStore((s) => s.activeOrganizationId),
    nav = useNavigate(),
    [source, setSource] = useState(""),
    [destination, setDestination] = useState(""),
    [qty, setQty] = useState<Record<string, number>>({});
  const { data: branches = [] } = useQuery({
    queryKey: ["branches", org],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch")
        .select("id,name")
        .eq("organization_id", org!);
      return data ?? [];
    },
    enabled: !!org,
  });
  const { data: levels = [] } = useQuery({
    queryKey: ["transfer-stock", org, source],
    queryFn: async () => {
      if (!source) return [];
      const { data: warehouses, error: warehouseError } = await supabase
        .from("warehouse")
        .select("id")
        .eq("organization_id", org!)
        .eq("branch_id", source)
        .is("deleted_at", null);
      if (warehouseError) throw warehouseError;
      const warehouseIds = (warehouses ?? []).map((warehouse) => warehouse.id);
      if (warehouseIds.length === 0) return [];
      const { data } = await supabase
        .from("stock_level")
        .select("product_id,quantity,product(name,sku)")
        .eq("organization_id", org!)
        .in("warehouse_id", warehouseIds);
      return data ?? [];
    },
    enabled: !!org && !!source,
  });
  return (
    <div className="px-6 py-6">
      <div className="flex items-start gap-3"><BackButton href="/app/inventory/products" label="Back to inventory"/><div><p className="text-[#64748b]">
        Inventory / Stock Transfers /{" "}
        <span className="text-[#009b96]">New Transfer</span>
      </p>
      <h1 className="text-[28px] font-bold mt-3">New Stock Transfer</h1>
      </div></div>
      <Card className="grid md:grid-cols-4 gap-5 mt-5">
        <FormField label="Source Branch">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Destination Branch">
          <Select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">Select branch</option>
            {branches
              .filter((b) => b.id !== source)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label="Transfer Date">
          <Input
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </FormField>
        <FormField label="Reference Number">
          <Input
            value={`TRF-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`}
            readOnly
          />
        </FormField>
      </Card>
      <Card noPadding className="mt-5 overflow-hidden">
        <h3 className="p-5 font-bold">Transfer Line Items</h3>
        {levels.length ? (
          <Table>
            <Thead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Source Stock</Th>
                <Th>Transfer Qty</Th>
                <Th>Remaining Stock</Th>
              </tr>
            </Thead>
            <tbody>
              {levels.map((l) => {
                const p = l.product as unknown as {
                    name: string;
                    sku: string;
                  } | null,
                  q = qty[l.product_id] ?? 0;
                return (
                  <Tr key={l.product_id}>
                    <Td className="font-bold">{p?.name}</Td>
                    <Td>{p?.sku}</Td>
                    <Td>{l.quantity}</Td>
                    <Td>
                      <Input
                        className="w-24"
                        type="number"
                        min="0"
                        max={l.quantity}
                        value={q}
                        onChange={(e) =>
                          setQty((v) => ({
                            ...v,
                            [l.product_id]: Number(e.target.value),
                          }))
                        }
                      />
                    </Td>
                    <Td>{l.quantity - q} Left</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Choose a source branch to load available stock" />
        )}
      </Card>
      <Card className="mt-5">
        <FormField label="Transfer Notes / Reasoning">
          <Textarea placeholder="Provide detailed reasons for stock routing here..." />
        </FormField>
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => nav("/app/inventory/products")}
          >
            Cancel
          </Button>
          <Button disabled={!source || !destination}>Create Transfer</Button>
        </div>
      </Card>
    </div>
  );
}

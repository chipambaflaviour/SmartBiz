import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/shared/lib/supabase";
import { useAppStore } from "@/shared/stores/appStore";
import {
  Badge,
  Card,
  EmptyState,
  Skeleton,
  Table,
  Td,
  Th,
  Thead,
  Tr,
} from "@/shared/components/ui/Display";
import { Button } from "@/shared/components/ui/Button";
const trend = [
  8, 11, 14, 13, 10, 7, 4, 3, 24, 22, 19, 16, 14, 11, 9, 8, 7, 6, 5, 4, 3, 3, 2,
  1, 1, 1, 1, 1,
];
export default function ProductDetailPage() {
  const { id } = useParams(),
    org = useAppStore((s) => s.activeOrganizationId),
    branch = useAppStore((s) => s.activeBranchId),
    nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["product-detail", org, branch, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product")
        .select(
          "*, product_category(name), stock_level(quantity,reserved_quantity,warehouse(name,branch_id))",
        )
        .eq("organization_id", org!)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!org && !!id,
  });
  if (isLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!data)
    return (
      <EmptyState
        title="Product not found"
        action={
          <Button onClick={() => nav("/app/inventory/products")}>
            Back to inventory
          </Button>
        }
      />
    );
  const stock =
      (data.stock_level as unknown as Array<{ quantity: number; warehouse: { branch_id: string | null } | Array<{ branch_id: string | null }> | null }>)
        ?.filter((level) => {
          if (!branch) return true;
          const warehouseBranch = Array.isArray(level.warehouse) ? level.warehouse[0]?.branch_id : level.warehouse?.branch_id;
          return warehouseBranch === branch;
        })
        .reduce(
        (s, x) => s + x.quantity,
        0,
      ) ?? 0,
    low = stock <= data.reorder_level;
  return (
    <div className="px-6 py-6">
      <p className="text-[#64748b]">
        Inventory / Products /{" "}
        <span className="text-[#009b96]">{data.name}</span>
      </p>
      <div className="flex justify-between mt-3">
        <h1 className="text-[28px] font-bold">
          {data.name} {low && <Badge variant="warning">LOW STOCK</Badge>}
        </h1>
        <Button
          variant="outline"
          onClick={() => nav(`/app/inventory/products/${id}/edit`)}
        >
          Edit Product
        </Button>
      </div>
      <Card className="grid md:grid-cols-5 gap-5 mt-5">
        {[
          ["SKU Number", data.sku],
          [
            "Category",
            (data.product_category as unknown as { name: string } | null)
              ?.name ?? "Uncategorised",
          ],
          ["Unit Price", `ZMW ${data.unit_price}`],
          ["Reorder Level", String(data.reorder_level)],
          ["Barcode", data.barcode ?? "—"],
        ].map(([a, b]) => (
          <div key={a}>
            <p className="text-[11px] uppercase text-[#8492ad]">{a}</p>
            <strong>{b}</strong>
          </div>
        ))}
      </Card>
      <div className="grid grid-cols-12 gap-5 mt-5">
        <div className="col-span-12 xl:col-span-8 space-y-5">
          <Card>
            <h3 className="font-bold">30-Day Stock Movement Trend</h3>
            <div className="h-32 flex items-end gap-2 mt-6">
              {trend.map((v, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-t ${v < 5 ? "bg-red-400" : "bg-[#00c8c2]"}`}
                  style={{ height: `${v * 4}px` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-[#8492ad] mt-3">
              <span>30 Days Ago</span>
              <span>Mid-Month Delivery</span>
              <span>Today</span>
            </div>
          </Card>
          <Card noPadding className="overflow-hidden">
            <h3 className="font-bold p-5">Recent Stock Movements</h3>
            <Table>
              <Thead>
                <tr>
                  <Th>Timestamp</Th>
                  <Th>Activity Detail</Th>
                  <Th>Qty Action</Th>
                  <Th>Operated By</Th>
                </tr>
              </Thead>
              <tbody>
                {[
                  ["Today, 14:20", "POS Sale", "-3", "POS terminal 01"],
                  ["Yesterday, 10:15", "Purchase Order", "+50", "Mwila Chanda"],
                  ["08 Oct 2024", "Stock Transfer", "+15", "System Auto"],
                  [
                    "05 Oct 2024",
                    "Inventory Adjustment",
                    "-2",
                    "Manager Override",
                  ],
                ].map((x) => (
                  <Tr key={x[0]}>
                    {x.map((v, i) => (
                      <Td
                        key={i}
                        className={
                          i === 2
                            ? v.startsWith("+")
                              ? "text-emerald-600 font-bold"
                              : "text-red-500 font-bold"
                            : ""
                        }
                      >
                        {v}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
        <Card className="col-span-12 xl:col-span-4 self-start bg-[#fbf4ff] border-[#dfc1ff]">
          <h3 className="font-bold text-purple-800">
            SMART INVENTORY INSIGHTS
          </h3>
          <div className="mt-5 space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span>Current Available Stock</span>
              <strong>{stock} Units</strong>
            </div>
            <div className="flex justify-between">
              <span>Minimum Required Stock</span>
              <strong>{data.reorder_level} Units</strong>
            </div>
            <div className="flex justify-between">
              <span>Inventory Velocity</span>
              <strong>High Usage</strong>
            </div>
            <div className="border-t border-purple-200 pt-4">
              <p className="text-[11px] font-bold uppercase text-purple-800">
                System Recommendation
              </p>
              <strong className="block mt-2">
                Order {Math.max(0, data.reorder_level * 4 - stock)} units
                immediately
              </strong>
              <p className="text-[#64748b] mt-2">
                Stockout risk is calculated from current stock and reorder
                thresholds.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

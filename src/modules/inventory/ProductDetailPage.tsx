import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { isDemoMode, supabase } from "@/shared/lib/supabase";
import { useAppStore } from "@/shared/stores/appStore";
import {
  Badge,
  BackButton,
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
import { FormField, Input, Select, Textarea } from "@/shared/components/ui/FormElements";
const trend = [
  8, 11, 14, 13, 10, 7, 4, 3, 24, 22, 19, 16, 14, 11, 9, 8, 7, 6, 5, 4, 3, 3, 2,
  1, 1, 1, 1, 1,
];
export default function ProductDetailPage() {
  const { id } = useParams(),
    org = useAppStore((s) => s.activeOrganizationId),
    branch = useAppStore((s) => s.activeBranchId),
    currentUser = useAppStore((s) => s.currentUser),
    nav = useNavigate();
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin);
  const accessPreview = useAppStore((s) => s.accessPreview);
  const location = useLocation();
  const queryClient = useQueryClient();
  const [showDelete, setShowDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [writeOffQuantity, setWriteOffQuantity] = useState("");
  const [writeOffCategory, setWriteOffCategory] = useState("damaged");
  const [writeOffStockLevelId, setWriteOffStockLevelId] = useState("");
  const { data: role = "member" } = useQuery({ queryKey: ["product-detail-role", org, currentUser?.id], queryFn: async()=>{if(isDemoMode)return "owner";const{data}=await supabase.from("user_organization").select("role").eq("organization_id",org!).eq("user_id",currentUser!.id).eq("is_active",true).maybeSingle();return data?.role??"member"},enabled:!!org&&!!currentUser?.id });
  const canAdminister = accessPreview ? accessPreview.role === "owner" || accessPreview.role === "admin" : isPlatformAdmin || role === "owner" || role === "admin";
  const effectiveRequesterId = accessPreview?.userId ?? currentUser?.id;
  const { data: approverId } = useQuery({ queryKey:["product-delete-approver",org,currentUser?.id,isPlatformAdmin],queryFn:async()=>{const{data}=await supabase.from("user_organization").select("user_id").eq("organization_id",org!).eq("is_active",true).in("role",["owner","admin"]).limit(1).maybeSingle();return data?.user_id??(isPlatformAdmin?currentUser?.id:null)??null},enabled:!!org&&!canAdminister });
  const { data, isLoading } = useQuery({
    queryKey: ["product-detail", org, branch, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product")
        .select(
          "*, product_category(name), stock_level(id,warehouse_id,quantity,reserved_quantity,warehouse(name,branch_id))",
        )
        .eq("organization_id", org!)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!org && !!id,
  });
  const removeProduct = useMutation({mutationFn:async()=>{if(!deleteReason.trim())throw new Error("A reason is required.");if(!org||!id)throw new Error("Product not found.");const quantity=Number(writeOffQuantity);if(!Number.isFinite(quantity)||quantity<=0)throw new Error("Enter a quantity greater than zero.");const levels=(data?.stock_level??[]) as Array<{id:string;warehouse_id:string;quantity:number;warehouse:{name:string;branch_id:string|null}|null}>;const level=levels.find(item=>item.id===writeOffStockLevelId)??levels.find(item=>!branch||item.warehouse?.branch_id===branch);if(!level)throw new Error("No warehouse stock is available for this product.");if(quantity>Number(level.quantity))throw new Error(`Only ${level.quantity} ${data?.base_unit??"units"} are available in ${level.warehouse?.name??"this warehouse"}.`);if(!effectiveRequesterId)throw new Error("The requesting employee could not be identified.");const details={product_name:data?.name,sku:data?.sku,quantity,base_unit:data?.base_unit??"piece",reason_category:writeOffCategory,stock_level_id:level.id,warehouse_id:level.warehouse_id,warehouse_name:level.warehouse?.name,current_quantity:Number(level.quantity)};if(canAdminister){const{error}=await supabase.rpc("apply_stock_write_off",{p_organization_id:org,p_product_id:id,p_stock_level_id:level.id,p_quantity:quantity,p_reason_category:writeOffCategory,p_reason:deleteReason.trim(),p_requested_by:effectiveRequesterId,p_approval_request_id:null});if(error)throw error;await supabase.from("audit_log").insert({organization_id:org,user_id:currentUser?.id,module:"inventory",action:"STOCK_WRITTEN_OFF",entity_type:"product",entity_id:id,metadata:{...details,reason:deleteReason.trim()}})}else{if(!approverId)throw new Error("No administrator is available to approve this request.");const{error}=await supabase.from("approval_request").insert({organization_id:org,module:"inventory",reference_type:"product",reference_id:id,title:`Write off ${quantity} ${data?.base_unit??"units"}: ${data?.name??id}`,description:deleteReason.trim(),requester_id:effectiveRequesterId,approver_id:approverId,status:"pending",action:"stock_write_off",requested_changes:details});if(error)throw error}},onSuccess:()=>{queryClient.invalidateQueries({queryKey:["products-list"]});queryClient.invalidateQueries({queryKey:["product-detail"]});queryClient.invalidateQueries({queryKey:["approvals"]});setShowDelete(false);setDeleteReason("");setWriteOffQuantity("");nav(`/app/inventory/products/${id}`,{state:{notice:canAdminister?"Stock write-off completed.":"Stock write-off request sent to an administrator for approval."}})}});
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
      {(location.state as {notice?:string}|null)?.notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{(location.state as {notice?:string}).notice}</div>}
      <div className="flex items-start gap-3">
        <BackButton href="/app/inventory/products" label="Back to products" />
        <div className="min-w-0 flex-1">
          <p className="text-[#64748b]">Inventory / Products / <span className="text-[#009b96]">{data.name}</span></p>
          <div className="mt-3 flex flex-wrap justify-between gap-3">
            <h1 className="text-[28px] font-bold">{data.name} {low && <Badge variant="warning">LOW STOCK</Badge>}</h1>
        <div className="flex flex-wrap gap-2"><Button
          variant="outline"
          onClick={() => nav(`/app/inventory/products/${id}/edit`)}
        >
          Edit Product
        </Button><Button variant="danger" onClick={()=>setShowDelete(true)}>{canAdminister?"Write off stock":"Request stock write-off"}</Button></div>
          </div>
        </div>
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
          ["Stock Unit", data.base_unit ?? "piece"],
          ["Wholesale Package", data.pack_unit ? `1 ${data.pack_unit} = ${data.units_per_pack} ${data.base_unit ?? "pieces"}` : "Not configured"],
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
      {showDelete&&<div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/50 p-4" onClick={()=>setShowDelete(false)}><Card className="w-full max-w-lg" onClick={event=>event.stopPropagation()}><h2 className="text-xl font-bold">{canAdminister?"Write off stock":"Request stock write-off"}</h2><p className="mt-2 text-sm text-[#64748b]">Remove only the damaged, expired or otherwise unusable quantity. The product remains available for future sales.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><FormField label={`Quantity (${data.base_unit??"units"})`} required><Input type="number" min="0.0001" step={data.base_unit==="kg"||data.base_unit==="litre"?"0.01":"1"} value={writeOffQuantity} onChange={event=>setWriteOffQuantity(event.target.value)} placeholder="e.g. 5"/></FormField><FormField label="Reason category" required><Select value={writeOffCategory} onChange={event=>setWriteOffCategory(event.target.value)}><option value="damaged">Damaged</option><option value="expired">Expired</option><option value="spoiled">Spoiled</option><option value="lost">Lost / missing</option><option value="other">Other</option></Select></FormField><FormField label="Warehouse" required className="sm:col-span-2"><Select value={writeOffStockLevelId} onChange={event=>setWriteOffStockLevelId(event.target.value)}><option value="">Use current branch warehouse</option>{((data.stock_level??[]) as Array<{id:string;quantity:number;warehouse:{name:string}|null}>).map(level=><option key={level.id} value={level.id}>{level.warehouse?.name??"Warehouse"} — {level.quantity} available</option>)}</Select></FormField><FormField label="Explanation" required className="sm:col-span-2"><Textarea value={deleteReason} onChange={event=>setDeleteReason(event.target.value)} placeholder="Example: Five bottles were damaged when the carton fell during unloading."/></FormField></div>{removeProduct.error&&<p role="alert" className="mt-3 text-sm text-red-700">{removeProduct.error.message}</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={()=>setShowDelete(false)}>Cancel</Button><Button variant="danger" loading={removeProduct.isPending} disabled={!deleteReason.trim()||!writeOffQuantity} onClick={()=>removeProduct.mutate()}>{canAdminister?"Confirm write-off":"Send for approval"}</Button></div></Card></div>}
    </div>
  );
}

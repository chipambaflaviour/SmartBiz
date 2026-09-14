import type { User } from '@supabase/supabase-js'
import { DEFAULT_ENABLED_MODULES } from './blueprint'

export const DEMO_ORG_ID = 'demo-lusaka-fresh-market'
export const DEMO_USER = {
  id: 'demo-user-mwila-chanda', email: 'admin@smartbiz.co.zm',
  user_metadata: { full_name: 'Mwila Chanda' }, app_metadata: {}, aud: 'authenticated',
  created_at: '2024-01-10T08:00:00.000Z',
} as User
export const DEMO_MEMBERSHIPS = [{ organization_id: DEMO_ORG_ID, role: 'admin', organization: { id: DEMO_ORG_ID, name: 'Lusaka Fresh Market', plan: 'enterprise', logo_url: null } }]
export const DEMO_MODULES = [...DEFAULT_ENABLED_MODULES, 'settings'].map((moduleKey)=>({moduleKey,isEnabled:true}))
export const DEMO_PRODUCTS = [
  ['product-1','SKU-CO-5L-001','Cooking Oil 5L',185,5,'Dry Goods'],['product-2','SKU-SUG-2K-010','Pure Sugar 2kg',45,2,'Dry Goods'],['product-3','SKU-MIL-25-055','Roller Meal 25kg',160,0,'Fresh Produce'],['product-4','SKU-MLK-1L-002','Fresh Milk 1L',28,120,'Beverages'],['product-5','SKU-BN-1K-098','Dry Beans 1kg',35,75,'Dry Goods'],['product-6','SKU-RIC-5K-012','Basmati Rice 5kg',190,45,'Dry Goods'],['product-7','SKU-SOP-25-101','Soap Bar 250g',18,110,'Dry Goods'],['product-8','SKU-OJU-1L-045','Orange Juice 1L',22,64,'Beverages'],
].map(([id,sku,name,unit_price,quantity,category])=>({id,sku,name,unit_price,image_url:null,is_active:true,category_id:String(category).toLowerCase().replace(' ', '-'),product_category:{name:category},stock_level:[{quantity,warehouse:{name:'Main Warehouse'}}]}))
export const DEMO_CUSTOMERS = [
  ['customer-1','Kabwe Trading Co.','kabwe@trading.co.zm','+260 97 8472910','wholesale',245800,12450],['customer-2','Mulenga Fresh Grocers','mulenga@fresh.co.zm','+260 96 4473821','corporate',189200,0],['customer-3','Sarah Bwalya','sarah@bwalya.me','+260 95 1928374','retail',12450,3120],['customer-4','Choma Agro Holdings','choma@agrofields.com','+260 97 5582910','wholesale',312000,45000],['customer-5','Copperbelt Bakers','orders@cbbakers.co.zm','+260 96 3392810','corporate',154300,18900],
].map((x,i)=>({id:x[0],name:x[1],email:x[2],phone:x[3],segment:x[4],total_spend:x[5],outstanding_balance:x[6],created_at:new Date(2024,i,10).toISOString()}))
export const DEMO_INVOICES = DEMO_CUSTOMERS.map((c,i)=>({id:`invoice-${i+1}`,invoice_number:`INV-2024-0${847-i}`,issue_date:new Date(Date.now()-i*86400000).toISOString(),due_date:new Date(Date.now()+(15-i)*86400000).toISOString(),total_amount:[12450,3120,18900,4500,22800][i],status:['paid','pending','paid','refunded','overdue'][i],customer:{id:c.id,name:c.name}}))
export const DEMO_EMPLOYEES = [
  ['employee-1','EMP-001','Mwila','Chanda','mwila@smartbiz.co.zm','Operations Manager','full-time','active','Operations'],['employee-2','EMP-002','Sarah','Bwalya','sarah@smartbiz.co.zm','Sales Supervisor','full-time','active','Sales'],['employee-3','EMP-003','Kondwani','Phiri','kondwani@smartbiz.co.zm','Inventory Controller','full-time','active','Inventory'],['employee--4','EMP-004','Thandiwe','Zulu','thandiwe@smartbiz.co.zm','Accountant','full-time','on-leave','Finance'],
].map(x=>({id:x[0],employee_id:x[1],first_name:x[2],last_name:x[3],email:x[4],avatar_url:null,position:x[5],employment_type:x[6],status:x[7],department:{name:x[8]}}))
export const DEMO_APPROVALS = [
  {id:'approval-1',title:'Purchase Order PO-2024-0089',description:'Fresh Farm Suppliers • ZMW 48,500',module:'inventory',reference_type:'purchase_order',reference_id:'PO-2024-0089',created_at:new Date().toISOString(),status:'pending',requester_id:'employee-3'},
  {id:'approval-2',title:'Annual Leave Request',description:'Sarah Bwalya • 5 working days',module:'hr',reference_type:'leave_request',reference_id:'leave-1',created_at:new Date(Date.now()-7200000).toISOString(),status:'pending',requester_id:'employee-2'},
  {id:'approval-3',title:'Regional Travel Expense',description:'Mwila Chanda • ZMW 4,850',module:'finance',reference_type:'expense_claim',reference_id:'expense-1',created_at:new Date(Date.now()-86400000).toISOString(),status:'pending',requester_id:'employee-1'},
]

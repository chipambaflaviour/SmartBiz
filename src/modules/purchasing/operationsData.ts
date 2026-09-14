export const purchaseOrders = [
  { id:'PO-2024-0089', supplier:'Fresh Farm Suppliers', items:12, amount:48500, status:'sent', arrival:'18 Oct 2024' },
  { id:'PO-2024-0088', supplier:'Copperbelt Wholesalers', items:3, amount:124000, status:'received', arrival:'11 Oct 2024' },
  { id:'PO-2024-0087', supplier:'Lusaka Grain Mills', items:1, amount:8400, status:'draft', arrival:'10 Oct 2024' },
  { id:'PO-2024-0086', supplier:'Zambia Sugar PLC', items:15, amount:72000, status:'sent', arrival:'08 Oct 2024' },
  { id:'PO-2024-0085', supplier:'Kabwe General Foods', items:6, amount:34200, status:'received', arrival:'05 Oct 2024' },
  { id:'PO-2024-0084', supplier:'Ndola Logistics', items:22, amount:112000, status:'pending', arrival:'03 Oct 2024' },
]
export const suppliers = [
  ['Fresh Farm Suppliers','Kondwani Phiri','+260 977 123456','orders@freshfarm.co.zm','Fresh Produce',48500,'4.8'],
  ['Copperbelt Wholesalers','Sela Mulenga','+260 966 987654','sales@cbwholesalers.zm','Dry Goods',124000,'4.2'],
  ['Lusaka Grain Mills','Mabvuto Banda','+260 955 456123','info@lusakagrain.co.zm','Dry Goods',8400,'4.5'],
  ['Zambia Sugar PLC','Agness Chansa','+260 971 789456','b2b@zambiasugar.zm','Dry Goods',72000,'4.9'],
  ['Kabwe General Foods','Harrison Mwansa','+260 962 123789','kabwefoods@co.zm','Dry Goods',34200,'3.8'],
  ['Ndola Logistics','Bupe Bwalya','+260 950 321654','ndolalogistics@co.zm','Logistics',112000,'4.0'],
] as const
export const poLines = [
  ['Cooking Oil 5L','SKU-CO-5L-001',150,150,120,18000],['Pure Sugar 2kg','SKU-SUG-2K-010',200,150,32,6400],['Dry Beans 1kg','SKU-BN-1K-098',100,100,25,2500],['Basmati Rice 5kg','SKU-RIC-5K-012',100,100,140,14000],
] as const

import jwt from 'jsonwebtoken';
import { writeFileSync } from 'node:fs';

const SECRET = 'dev-local-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const out = [];

const mkToken = (id, role, email, name) => jwt.sign({ id, email, role, name }, SECRET, { expiresIn: '1h' });
const shopToken = mkToken(132, 'shop', 'shop@test.local', 'Le Salut Des Saints');

const step = (msg) => out.push(msg);

let r = await fetch('http://localhost:4000/api/products');
const product = (await r.json()).products.find((p) => p.shop_id === 132);
step(`product: id=${product.id} name=${product.name}`);
const pid = product.id;

const body = { items: [{ product_id: pid, quantity: 1 }], buyer_name: 'Test E2E', buyer_phone: '+237690000001', buyer_city: 'Douala' };
r = await fetch('http://localhost:4000/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const created = (await r.json()).sales[0];
step(`order -> sale id=${created.id} code=${created.confirm_code} status=${created.status}`);

r = await fetch(`http://localhost:4000/api/sales/${created.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${shopToken}` }, body: JSON.stringify({ status: 'confirmed' }) });
step(`confirm -> ${r.status}`);

r = await fetch(`http://localhost:4000/api/sales/${created.id}/deliver`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_fee: 0, payment_method: 'espece', client_code: created.confirm_code }) });
step(`deliver -> ${r.status} ${(await r.text()).slice(0, 120)}`);

r = await fetch('http://localhost:4000/api/sales/shop/132', { headers: { Authorization: `Bearer ${shopToken}` } });
const sj = await r.json();
const s38 = sj.sales.find((s) => s.id === created.id);
step(`shop list total=${sj.sales.length} | sale present=${!!s38} status=${s38 ? s38.status : '-'} paid=${s38 ? s38.paid : '-'} seller=${s38 ? s38.seller_name : '-'} commission=${s38 ? s38.commission : '-'}`);
step(`stats: owed_commission=${sj.stats.owed_commission} total_commission=${sj.stats.total_commission}`);

r = await fetch(`http://localhost:4000/api/sales/${created.id}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${shopToken}` }, body: JSON.stringify({ proof: 'data:image/png;base64,kdvfkdv' }) });
step(`pay cart order -> ${r.status} ${(await r.text()).slice(0, 100)}`);

writeFileSync('C:/Users/EASYST~1/AppData/Local/Temp/opencode/e2e3.txt', out.join('\n'), 'utf8');
console.log('done');
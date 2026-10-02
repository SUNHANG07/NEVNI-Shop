const express=require("express"),fs=require("fs"),path=require("path"),crypto=require("crypto"),multer=require("multer");require("dotenv").config();
const app=express(),PORT=Number(process.env.PORT||3000),DATA=path.join(__dirname,"data/db.json"),UPLOAD=path.join(__dirname,"public/uploads"),sessions=new Set();
fs.mkdirSync(UPLOAD,{recursive:true});
const read=()=>{try{return JSON.parse(fs.readFileSync(DATA,"utf8"))}catch(e){const d={products:[],orders:[]};save(d);return d}};
const save=d=>fs.writeFileSync(DATA,JSON.stringify(d,null,2),"utf8");
const storage=multer.diskStorage({destination:(r,f,c)=>c(null,UPLOAD),filename:(r,f,c)=>c(null,"product-"+Date.now()+"-"+crypto.randomBytes(3).toString("hex")+path.extname(f.originalname).toLowerCase())});
const upload=multer({storage,limits:{fileSize:5*1024*1024},fileFilter:(r,f,c)=>c(["image/jpeg","image/png","image/webp","image/gif"].includes(f.mimetype)?null:new Error("JPG, PNG, WEBP, GIF만 가능합니다."))});
app.use(express.json());app.use(express.urlencoded({extended:true}));app.use(express.static(path.join(__dirname,"public")));
function admin(r,s,n){if(!sessions.has(r.headers["x-admin-token"]))return s.status(401).json({error:"관리자 로그인이 필요합니다."});n()}
app.post("/api/admin/login",(r,s)=>{if(r.body.id!==process.env.ADMIN_ID||r.body.password!==process.env.ADMIN_PASSWORD)return s.status(401).json({error:"아이디 또는 비밀번호가 올바르지 않습니다."});const t=crypto.randomBytes(32).toString("hex");sessions.add(t);s.json({ok:true,token:t})});
app.post("/api/admin/logout",admin,(r,s)=>{sessions.delete(r.headers["x-admin-token"]);s.json({ok:true})});
app.get("/api/payment/config",(r,s)=>s.json({clientKey:process.env.TOSS_CLIENT_KEY||""}));
app.get("/api/products",(r,s)=>s.json(read().products.filter(p=>p.active&&p.stock>0)));
app.get("/api/products/:id",(r,s)=>{const p=read().products.find(p=>p.id===r.params.id&&p.active);p?s.json(p):s.status(404).json({error:"상품을 찾을 수 없습니다."})});
app.get("/api/admin/products",admin,(r,s)=>s.json(read().products));
app.post("/api/admin/products", admin, (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const n = String(req.body.name || "").trim();
    const price = Number(req.body.price);
    const stock = Number(req.body.stock ?? 0);
    if (!n) return res.status(400).json({ error: "상품명을 입력하세요." });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "가격을 올바르게 입력하세요." });
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: "재고는 0 이상의 정수로 입력하세요." });

    const d = read();
    const p = {
      id: "p-" + Date.now() + "-" + crypto.randomBytes(2).toString("hex"),
      name: n,
      price,
      stock,
      image: req.file ? "/uploads/" + req.file.filename : "",
      description: String(req.body.description || ""),
      active: true,
      createdAt: new Date().toISOString()
    };
    d.products.push(p);
    save(d);
    res.json(p);
  });
});
app.delete("/api/admin/products/:id",admin,(r,s)=>{const d=read(),n=d.products.length;d.products=d.products.filter(p=>p.id!==r.params.id);if(d.products.length===n)return s.status(404).json({error:"상품을 찾을 수 없습니다."});save(d);s.json({ok:true})});
app.post("/api/orders",(r,s)=>{
  const d=read(),items=r.body.items||[],customer=r.body.customer||{};
  if(!items.length)return s.status(400).json({error:"장바구니가 비어 있습니다."});
  if(!customer.name||!customer.phone||!customer.address)return s.status(400).json({error:"주문자 이름, 연락처, 배송주소를 입력해주세요."});
  let total=0,out=[];
  for(const i of items){
    const p=d.products.find(p=>p.id===i.id&&p.active),q=Number(i.qty);
    if(!p||!Number.isInteger(q)||q<1)return s.status(400).json({error:"상품 정보가 올바르지 않습니다."});
    if(p.stock<q)return s.status(400).json({error:p.name+" 재고가 부족합니다."});
    total+=p.price*q;out.push({id:p.id,name:p.name,price:p.price,qty:q});
  }
  const o={id:"o-"+Date.now()+"-"+crypto.randomBytes(3).toString("hex"),createdAt:new Date().toISOString(),status:"결제대기",paymentStatus:"READY",paymentKey:"",items:out,total,customer};
  d.orders.push(o);save(d);s.json({orderId:o.id,total:o.total,orderName:out.length===1?out[0].name:out[0].name+" 외 "+(out.length-1)+"건"});
});
app.get("/api/orders/:id",(r,s)=>{
  const o=read().orders.find(x=>x.id===r.params.id);
  o?s.json(o):s.status(404).json({error:"주문을 찾을 수 없습니다."});
});
app.post("/api/payments/confirm",async(r,s)=>{
  const {paymentKey,orderId,amount}=r.body||{};
  const d=read(),o=d.orders.find(x=>x.id===orderId);
  if(!o)return s.status(404).json({error:"주문을 찾을 수 없습니다."});
  if(o.paymentStatus==="PAID")return s.json(o);
  if(Number(amount)!==Number(o.total))return s.status(400).json({error:"결제 금액이 주문 금액과 일치하지 않습니다."});
  if(!process.env.TOSS_SECRET_KEY)return s.status(500).json({error:"TOSS_SECRET_KEY가 설정되지 않았습니다. 테스트 키를 .env에 입력하세요."});
  try{
    const auth=Buffer.from(process.env.TOSS_SECRET_KEY+":").toString("base64");
    const rr=await fetch("https://api.tosspayments.com/v1/payments/confirm",{method:"POST",headers:{"Authorization":"Basic "+auth,"Content-Type":"application/json"},body:JSON.stringify({paymentKey,orderId,amount:Number(amount)})});
    const result=await rr.json();
    if(!rr.ok)return s.status(rr.status).json({error:result.message||"결제 승인에 실패했습니다.",code:result.code});
    for(const i of o.items){
      const p=d.products.find(p=>p.id===i.id);
      if(!p||p.stock<i.qty)return s.status(400).json({error:"결제는 승인됐지만 재고 확인에 실패했습니다. 관리자에게 문의하세요."});
    }
    for(const i of o.items)d.products.find(p=>p.id===i.id).stock-=i.qty;
    o.paymentKey=paymentKey;o.paymentStatus="PAID";o.status="결제완료";o.paidAt=new Date().toISOString();o.paymentMethod=result.method||"";
    save(d);s.json(o);
  }catch(e){s.status(500).json({error:"결제 승인 서버 오류가 발생했습니다."})}
});
app.get("/api/admin/orders",admin,(r,s)=>s.json(read().orders));
app.patch("/api/admin/orders/:id",admin,(r,s)=>{
  const d=read();
  const o=d.orders.find(x=>x.id===r.params.id);
  if(!o)return s.status(404).json({error:"주문을 찾을 수 없습니다."});
  const allowed=["주문접수","결제완료","상품준비","배송중","배송완료","주문취소"];
  if(r.body.status!==undefined){
    if(!allowed.includes(r.body.status))return s.status(400).json({error:"올바르지 않은 주문 상태입니다."});
    o.status=r.body.status;
  }
  if(r.body.carrier!==undefined)o.carrier=String(r.body.carrier);
  if(r.body.trackingNumber!==undefined)o.trackingNumber=String(r.body.trackingNumber);
  o.updatedAt=new Date().toISOString();
  save(d);
  s.json(o);
});
app.listen(PORT,()=>console.log(`NEVNI SHOP http://localhost:${PORT}\n관리자 http://localhost:${PORT}/admin.html`));

import { useState, useMemo, useRef, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";

// ====================================================
// 🔗 رابط Google Apps Script — بيجيب الداتا من الشيت
// ====================================================
const SHEET_URL = "https://script.google.com/macros/s/AKfycbzsBGzn1wGqrBtGRc5WSZnaXvPIzcq3q8YyOW37N2voeep8z1hZ5yhRgATxMzWlhg5X/exec";

const REASON_A = "Re-delivery without shipping fees";
const REASON_B = "Need courier";

const FEEDBACK_OPTIONS = [
  "Not reached removed from bundle","Need courier","Already Out By User",
  "2nd return","Need First Slots","Will Join Later",
  "Re-delivery without bundle","Can't read/write",
];

const COLORS = ["#0077aa","#e06000","#2e7d32","#c62828","#6a1b9a","#00838f","#ad1457","#1565c0"];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{background:"#fff",border:"1px solid #ddd",padding:"10px 16px",fontFamily:"'DM Mono',monospace",fontSize:12,color:"#111",borderRadius:2,boxShadow:"0 2px 8px rgba(0,0,0,0.1)"}}>
        <div style={{color:"#666",marginBottom:4}}>{label}</div>
        {payload.map((p,i) => <div key={i} style={{color:p.color||"#0077aa",fontWeight:700}}>{p.name}: {p.value}</div>)}
      </div>
    );
  }
  return null;
};

export default function AgentDashboard() {
  const [data, setData] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetMsg, setSheetMsg] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState("day");
  const [activeTab, setActiveTab] = useState("overview");
  const [form, setForm] = useState({exportDate:"",orderCode:"",agent:"",feedback:""});
  const [deleteId, setDeleteId] = useState(null);
  const [nextId, setNextId] = useState(1);
  const [uploadMsg, setUploadMsg] = useState(null);
  const fileInputRef = useRef(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // الداتا بعد الفلتر
  const filteredData = useMemo(() => {
    if (!dateFrom && !dateTo) return data;
    return data.filter(r => {
      const d = r.exportDate;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [data, dateFrom, dateTo]);

  // ====================================================
  // 📥 جيب الداتا من Google Sheets تلقائياً
  // ====================================================
  const parseDate = (val) => {
    if (!val) return "";
    const s = String(val).trim();
    // فورمات ISO من Google Sheets: 2026-01-01T22:00:00.000Z
    if (s.includes("T")) {
      // بناخد التاريخ من الشيت مباشرة بدون تحويل UTC
      return s.slice(0, 10); // 2026-01-01
    }
    // فورمات M/D/YYYY — شهر/يوم/سنة
    const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [_, m, d, y] = slashMatch;
      return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
    // فورمات YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s;
  };

  const fetchFromSheet = async () => {
    setLoadingSheet(true);
    setSheetMsg(null);
    try {
      const res = await fetch(SHEET_URL);
      const rows = await res.json();
      if (!rows || rows.length === 0) {
        setSheetMsg({type:"error", text:"الشيت فاضي أو مفيش بيانات!"});
        setLoadingSheet(false);
        return;
      }
      let idCounter = 1;
      const parsed = rows.map(row => ({
        id: idCounter++,
        exportDate: parseDate(row["Export date"] || row["Export Date"] || ""),
        orderCode: String(row["Order Code"] || "").trim(),
        agent: String(row["Agent Name"] || "").trim(),
        feedback: String(row["Final feedback"] || row["Final Feedback"] || "").trim(),
      })).filter(r => r.orderCode || r.agent);
      setData(parsed);
      setNextId(parsed.length + 1);
      setSheetMsg({type:"success", text:`✓ تم تحميل ${parsed.length} سجل من الشيت!`});
      setTimeout(() => setSheetMsg(null), 4000);
    } catch(err) {
      setSheetMsg({type:"error", text:"مش قادر يوصل للشيت."});
    }
    setLoadingSheet(false);
  };

  useEffect(() => { fetchFromSheet(); }, []);

  // ====================================================
  // 📊 حسابات الإحصائيات
  // ====================================================
  const agentStats = useMemo(() => {
    const map = {};
    filteredData.forEach(r => {
      if (!map[r.agent]) map[r.agent] = {name:r.agent, total:0, feedbacks:{}};
      map[r.agent].total++;
      map[r.agent].feedbacks[r.feedback] = (map[r.agent].feedbacks[r.feedback]||0)+1;
    });
    return Object.values(map).sort((a,b)=>b.total-a.total);
  }, [filteredData]);

  const feedbackStats = useMemo(() => {
    const map = {};
    filteredData.forEach(r => { map[r.feedback]=(map[r.feedback]||0)+1; });
    return Object.entries(map).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  }, [filteredData]);

  const timelineData = useMemo(() => {
    if (viewMode==="day") {
      const map = {};
      data.forEach(r => { map[r.exportDate]=(map[r.exportDate]||0)+1; });
      return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,count])=>({label:date.slice(5)||date, count}));
    } else {
      const map = {};
      data.forEach(r => {
        const d = new Date(r.exportDate);
        const week = `W${Math.ceil(d.getDate()/7)}-${d.getMonth()+1}`;
        map[week]=(map[week]||0)+1;
      });
      return Object.entries(map).map(([label,count])=>({label,count}));
    }
  }, [data, viewMode]);

  const handleAdd = () => {
    if (!form.exportDate||!form.orderCode||!form.agent||!form.feedback) return;
    setData(prev=>[...prev,{...form,id:nextId}]);
    setNextId(n=>n+1);
    setForm({exportDate:"",orderCode:"",agent:"",feedback:""});
    setShowForm(false);
  };

  const handleDelete = (id) => { setData(prev=>prev.filter(r=>r.id!==id)); setDeleteId(null); };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isCSV = file.name.endsWith(".csv");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, {type:isCSV?"string":"binary", cellDates:true});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {defval:""});
        if (rows.length===0) { setUploadMsg({type:"error",text:"الملف فاضي!"}); return; }
        let idCounter = nextId;
        const parsed = rows.map(row => {
          let dateVal = row["Export date"]||row["Export Date"]||"";
          if (dateVal instanceof Date) dateVal = dateVal.toISOString().slice(0,10);
          else if (typeof dateVal==="number") { const d=XLSX.SSF.parse_date_code(dateVal); dateVal=`${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`; }
          else dateVal = String(dateVal).trim();
          return {id:idCounter++, exportDate:dateVal, orderCode:String(row["Order Code"]||"").trim(), agent:String(row["Agent Name"]||"").trim(), feedback:String(row["Final feedback"]||"").trim()};
        }).filter(r=>r.orderCode||r.agent);
        setNextId(idCounter);
        setData(prev=>[...prev,...parsed]);
        setUploadMsg({type:"success", text:`✓ تم رفع ${parsed.length} سجل!`});
        setTimeout(()=>setUploadMsg(null),4000);
      } catch(err) { setUploadMsg({type:"error",text:"خطأ في قراءة الملف."}); }
    };
    isCSV ? reader.readAsText(file,"UTF-8") : reader.readAsBinaryString(file);
    e.target.value="";
  };

  const tabs = [
    {id:"overview",label:"Overview"},{id:"agents",label:"Agents"},
    {id:"feedback",label:"Feedback"},{id:"compare",label:"Compare Reasons"},
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#f4f4f4;}
        .db{min-height:100vh;background:#f4f4f4;color:#111;font-family:'DM Mono',monospace;padding:28px 32px;}
        .header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:36px;border-bottom:1px solid #ddd;padding-bottom:20px;flex-wrap:wrap;gap:12px;}
        .title{font-family:'Syne',sans-serif;font-size:clamp(28px,4vw,52px);color:#111;line-height:1;}
        .title span{color:#0077aa;}
        .subtitle{font-size:11px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:6px;}
        .badge{font-size:11px;background:#fff;border:1px solid #ddd;color:#666;padding:6px 14px;letter-spacing:2px;border-radius:2px;}
        .tabs{display:flex;gap:2px;margin-bottom:28px;flex-wrap:wrap;}
        .tab{padding:10px 20px;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;border:none;cursor:pointer;transition:all 0.2s;border-radius:2px;}
        .tab.active{background:#0077aa;color:#fff;font-weight:500;}
        .tab.inactive{background:#fff;color:#aaa;border:1px solid #e0e0e0;}
        .tab.inactive:hover{color:#0077aa;border-color:#0077aa66;}
        .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-bottom:2px;}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:2px;}
        @media(max-width:768px){.grid3,.grid2{grid-template-columns:1fr;}}
        .card{background:#fff;border:1px solid #e8e8e8;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.05);}
        .card-title{font-size:10px;color:#aaa;letter-spacing:3px;text-transform:uppercase;margin-bottom:20px;}
        .stat-val{font-family:'Syne',sans-serif;font-size:48px;color:#111;line-height:1;}
        .stat-sub{font-size:11px;color:#888;margin-top:8px;letter-spacing:1px;}
        .agent-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f0f0f0;}
        .agent-row:last-child{border-bottom:none;}
        .agent-name{flex:1;font-size:13px;color:#333;}
        .agent-bar-wrap{flex:2;background:#f0f0f0;height:6px;border-radius:1px;overflow:hidden;}
        .agent-bar{height:100%;border-radius:1px;}
        .agent-count{font-size:13px;color:#0077aa;min-width:52px;text-align:right;}
        .fb-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:#f9f9f9;border:1px solid #e8e8e8;border-radius:2px;margin:4px;font-size:11px;color:#555;}
        .fb-count{color:#0077aa;font-weight:500;}
        .form-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:100;backdrop-filter:blur(6px);}
        .form-box{background:#fff;border:1px solid #ddd;padding:40px;width:480px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,0.12);}
        .form-title{font-family:'Syne',sans-serif;font-size:24px;color:#111;margin-bottom:28px;}
        .field{margin-bottom:16px;}
        .field label{display:block;font-size:10px;color:#aaa;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;}
        .field input,.field select{width:100%;background:#f9f9f9;border:1px solid #ddd;color:#111;padding:11px 14px;font-family:'DM Mono',monospace;font-size:13px;outline:none;transition:border-color 0.2s;border-radius:1px;}
        .field input:focus,.field select:focus{border-color:#0077aa;}
        .field select option{background:#fff;color:#111;}
        .btn-primary{background:#0077aa;color:#fff;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:12px 28px;border:none;cursor:pointer;font-weight:500;transition:opacity 0.2s;}
        .btn-primary:hover{opacity:0.85;}
        .btn-ghost{background:transparent;color:#888;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:12px 20px;border:1px solid #ddd;cursor:pointer;transition:all 0.2s;}
        .btn-ghost:hover{color:#333;border-color:#999;}
        .btn-danger{background:transparent;color:#c62828;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1px;padding:4px 10px;border:1px solid #c6282822;cursor:pointer;transition:all 0.2s;}
        .btn-danger:hover{background:#c6282811;}
        .table{width:100%;border-collapse:collapse;}
        .table th{font-size:10px;color:#aaa;letter-spacing:2px;text-transform:uppercase;padding:10px 14px;border-bottom:1px solid #eee;text-align:left;}
        .table td{font-size:12px;color:#555;padding:12px 14px;border-bottom:1px solid #f5f5f5;}
        .table tr:hover td{background:#f9f9f9;color:#111;}
        .toggle-wrap{display:flex;gap:2px;margin-bottom:20px;}
        .toggle-btn{padding:7px 16px;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:'DM Mono',monospace;border:1px solid #e0e0e0;cursor:pointer;transition:all 0.2s;border-radius:1px;}
        .toggle-btn.on{background:#5a9e2f;color:#fff;border-color:#5a9e2f;}
        .toggle-btn.off{background:#fff;color:#aaa;}
        .add-btn-wrap{display:flex;justify-content:flex-end;margin-bottom:20px;}
        .empty{text-align:center;padding:48px;color:#bbb;font-size:13px;letter-spacing:1px;}
        .loading{text-align:center;padding:80px;color:#aaa;font-size:13px;letter-spacing:2px;}
      `}</style>

      <div className="db">
        <motion.div className="header" initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}} transition={{duration:0.5}}>
          <div>
            <div className="title">RETENTION TEAM <span>PERFORMANCE</span></div>
            <div className="subtitle">// Orders · Performance · Feedback</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            {sheetMsg && (
              <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} style={{
                fontSize:12,padding:"6px 14px",borderRadius:2,
                background:sheetMsg.type==="success"?"#e8f5e9":"#ffebee",
                border:`1px solid ${sheetMsg.type==="success"?"#a5d6a7":"#ef9a9a"}`,
                color:sheetMsg.type==="success"?"#2e7d32":"#c62828",letterSpacing:1
              }}>{sheetMsg.text}</motion.div>
            )}
            <button className="btn-ghost" onClick={fetchFromSheet} disabled={loadingSheet}
              style={{padding:"6px 16px",fontSize:11,opacity:loadingSheet?0.5:1}}>
              {loadingSheet?"جاري التحميل...":"↻ تحديث من الشيت"}
            </button>
            <div className="badge">{data.length} RECORDS</div>
          </div>
        </motion.div>

        <div className="tabs">
          {tabs.map(t=>(
            <button key={t.id} className={`tab ${activeTab===t.id?"active":"inactive"}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* Date Filter Bar */}
        {activeTab !== "data" && (
          <div style={{
            background:"#fff",border:"1px solid #e0e0e0",borderRadius:2,
            padding:"14px 20px",marginBottom:16,
            display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",
            boxShadow:"0 1px 4px rgba(0,0,0,0.05)"
          }}>
            <div style={{fontSize:10,color:"#aaa",letterSpacing:2,textTransform:"uppercase",fontFamily:"'DM Mono',monospace"}}>📅 فلتر التاريخ</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <label style={{fontSize:11,color:"#888",fontFamily:"'DM Mono',monospace"}}>من</label>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                style={{background:"#f9f9f9",border:"1px solid #ddd",color:"#111",padding:"7px 12px",
                  fontFamily:"'DM Mono',monospace",fontSize:12,outline:"none",borderRadius:1,cursor:"pointer"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <label style={{fontSize:11,color:"#888",fontFamily:"'DM Mono',monospace"}}>إلى</label>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                style={{background:"#f9f9f9",border:"1px solid #ddd",color:"#111",padding:"7px 12px",
                  fontFamily:"'DM Mono',monospace",fontSize:12,outline:"none",borderRadius:1,cursor:"pointer"}}/>
            </div>
            {(dateFrom || dateTo) && (
              <button onClick={()=>{setDateFrom("");setDateTo("");}}
                style={{background:"transparent",color:"#c62828",fontFamily:"'DM Mono',monospace",
                  fontSize:11,letterSpacing:1,padding:"6px 12px",border:"1px solid #c6282833",cursor:"pointer",borderRadius:1}}>
                ✕ إلغاء الفلتر
              </button>
            )}
            <div style={{marginLeft:"auto",fontSize:11,letterSpacing:1,fontFamily:"'DM Mono',monospace",
              color:(dateFrom||dateTo)?"#0077aa":"#bbb"}}>
              {(dateFrom||dateTo)
                ? <span><b style={{color:"#0077aa"}}>{filteredData.length}</b> سجل من أصل {data.length}</span>
                : <span>{data.length} سجل إجمالي</span>
              }
            </div>
          </div>
        )}

        {loadingSheet && data.length===0 ? (
          <div className="loading">// جاري تحميل البيانات من الشيت...</div>
        ) : (
        <AnimatePresence mode="wait">

          {activeTab==="overview" && (
            <motion.div key="overview" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.3}}>
              <div className="grid3" style={{marginBottom:"2px"}}>
                {[
                  {label:"Total Orders",val:data.length,color:"#0077aa"},
                  {label:"Total Agents",val:agentStats.length,color:"#2e7d32"},
                  {label:"Feedback Types",val:feedbackStats.length,color:"#e06000"},
                ].map((s,i)=>(
                  <motion.div key={i} className="card" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.1}}>
                    <div className="card-title">{s.label}</div>
                    <div className="stat-val" style={{color:s.color}}>{s.val}</div>
                  </motion.div>
                ))}
              </div>
              <div className="card" style={{marginBottom:"2px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                  <div className="card-title" style={{margin:0}}>Orders Timeline</div>
                  <div className="toggle-wrap" style={{margin:0}}>
                    <button className={`toggle-btn ${viewMode==="day"?"on":"off"}`} onClick={()=>setViewMode("day")}>Daily</button>
                    <button className={`toggle-btn ${viewMode==="week"?"on":"off"}`} onClick={()=>setViewMode("week")}>Weekly</button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={timelineData}>
                    <CartesianGrid stroke="#f0f0f0" vertical={false}/>
                    <XAxis dataKey="label" tick={{fill:"#bbb",fontSize:10,fontFamily:"DM Mono"}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"#bbb",fontSize:10,fontFamily:"DM Mono"}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Line type="monotone" dataKey="count" stroke="#0077aa" strokeWidth={2} dot={{fill:"#0077aa",r:4}} name="Orders"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="card-title">Top Feedback Reasons</div>
                <div style={{display:"flex",flexWrap:"wrap"}}>
                  {feedbackStats.slice(0,6).map((f,i)=>(
                    <div key={i} className="fb-chip">
                      <span style={{color:COLORS[i%COLORS.length],fontSize:8}}>●</span>
                      {f.name}
                      <span className="fb-count">{data.length>0?((f.value/data.length)*100).toFixed(1)+"%":"0%"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab==="agents" && (
            <motion.div key="agents" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.3}}>
              <div className="grid2">
                <div className="card">
                  <div className="card-title">Agent Performance</div>
                  {agentStats.length===0&&<div className="empty">No data yet</div>}
                  {agentStats.map((a,i)=>(
                    <div key={i} className="agent-row">
                      <div className="agent-name">{a.name}</div>
                      <div className="agent-bar-wrap">
                        <motion.div className="agent-bar" style={{background:COLORS[i%COLORS.length]}}
                          initial={{width:0}} animate={{width:`${(a.total/agentStats[0].total)*100}%`}}
                          transition={{delay:i*0.1,duration:0.8,ease:"easeOut"}}/>
                      </div>
                      <div className="agent-count">{data.length>0?((a.total/data.length)*100).toFixed(1)+"%":"0%"}</div>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div className="card-title">Orders by Agent</div>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={agentStats} barCategoryGap="35%">
                      <XAxis dataKey="name" tick={{fill:"#aaa",fontSize:10,fontFamily:"DM Mono"}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:"#bbb",fontSize:10,fontFamily:"DM Mono"}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<CustomTooltip/>} cursor={{fill:"#00000004"}}/>
                      <Bar dataKey="total" radius={[2,2,0,0]} name="Orders">
                        {agentStats.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card" style={{marginTop:"2px"}}>
                <div className="card-title">Agent Feedback Breakdown</div>
                <table className="table">
                  <thead><tr><th>Agent</th><th>Total</th><th>% من الإجمالي</th><th>Top Feedback</th><th>% من أوردراته</th></tr></thead>
                  <tbody>
                    {agentStats.map((a,i)=>{
                      const top=Object.entries(a.feedbacks).sort((x,y)=>y[1]-x[1])[0];
                      return(
                        <tr key={i}>
                          <td style={{color:COLORS[i%COLORS.length]}}>{a.name}</td>
                          <td>{a.total}</td>
                          <td style={{color:"#0077aa"}}>{data.length>0?((a.total/data.length)*100).toFixed(1)+"%":"0%"}</td>
                          <td>{top?.[0]||"-"}</td>
                          <td style={{color:"#2e7d32"}}>{top&&a.total>0?((top[1]/a.total)*100).toFixed(1)+"%":"-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab==="feedback" && (
            <motion.div key="feedback" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.3}}>
              <div className="grid2">
                <div className="card">
                  <div className="card-title">Feedback Distribution</div>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie data={feedbackStats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={55} paddingAngle={3}>
                        {feedbackStats.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                      </Pie>
                      <Tooltip content={<CustomTooltip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <div className="card-title">Feedback Ranking</div>
                  {feedbackStats.map((f,i)=>(
                    <div key={i} className="agent-row">
                      <div style={{minWidth:18,fontSize:10,color:"#bbb"}}>#{i+1}</div>
                      <div className="agent-name" style={{fontSize:11}}>{f.name}</div>
                      <div className="agent-bar-wrap">
                        <motion.div className="agent-bar" style={{background:COLORS[i%COLORS.length]}}
                          initial={{width:0}} animate={{width:`${(f.value/feedbackStats[0].value)*100}%`}}
                          transition={{delay:i*0.07,duration:0.8,ease:"easeOut"}}/>
                      </div>
                      <div className="agent-count" style={{minWidth:52}}>
                        {data.length>0?((f.value/data.length)*100).toFixed(1)+"%":"0%"}
                        <span style={{display:"block",fontSize:9,color:"#888",marginTop:1}}>{f.value} records</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{marginTop:"2px"}}>
                <div className="card-title">Feedback by Agent (Stacked)</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={agentStats} barCategoryGap="30%">
                    <XAxis dataKey="name" tick={{fill:"#aaa",fontSize:10,fontFamily:"DM Mono"}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"#bbb",fontSize:10,fontFamily:"DM Mono"}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip/>} cursor={{fill:"#00000004"}}/>
                    <Legend wrapperStyle={{fontSize:10,fontFamily:"DM Mono",color:"#888"}}/>
                    {feedbackStats.slice(0,4).map((f,i)=>(
                      <Bar key={i} dataKey={d=>d.feedbacks[f.name]||0} name={f.name} stackId="a" fill={COLORS[i]}/>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {activeTab==="compare" && (
            <motion.div key="compare" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.3}}>
              <div className="grid2" style={{marginBottom:"2px"}}>
                <div className="card" style={{borderTop:"2px solid #0077aa"}}>
                  <div className="card-title">السبب الأول</div>
                  <div style={{fontSize:14,color:"#0077aa",fontWeight:500}}>{REASON_A}</div>
                </div>
                <div className="card" style={{borderTop:"2px solid #e06000"}}>
                  <div className="card-title">السبب الثاني</div>
                  <div style={{fontSize:14,color:"#e06000",fontWeight:500}}>{REASON_B}</div>
                </div>
              </div>
              {(()=>{
                const agentCompare=agentStats.map(a=>({
                  name:a.name,countA:a.feedbacks[REASON_A]||0,countB:a.feedbacks[REASON_B]||0,
                  total:a.total,combined:(a.feedbacks[REASON_A]||0)+(a.feedbacks[REASON_B]||0),
                })).sort((a,b)=>b.combined-a.combined);
                const totalA=agentCompare.reduce((s,a)=>s+a.countA,0);
                const totalB=agentCompare.reduce((s,a)=>s+a.countB,0);
                const totalCombined=totalA+totalB;
                const best=agentCompare[0];
                const worst=[...agentCompare].sort((a,b)=>a.combined-b.combined)[0];
                return(<>
                  <div className="grid3" style={{marginBottom:"2px"}}>
                    <div className="card" style={{borderTop:"2px solid #0077aa"}}>
                      <div className="card-title">Re-delivery — الإجمالي</div>
                      <div className="stat-val" style={{color:"#0077aa",fontSize:36}}>{totalA}</div>
                      <div className="stat-sub">{data.length>0?((totalA/data.length)*100).toFixed(1):0}% من الكل</div>
                    </div>
                    <div className="card" style={{borderTop:"2px solid #e06000"}}>
                      <div className="card-title">Need Courier — الإجمالي</div>
                      <div className="stat-val" style={{color:"#e06000",fontSize:36}}>{totalB}</div>
                      <div className="stat-sub">{data.length>0?((totalB/data.length)*100).toFixed(1):0}% من الكل</div>
                    </div>
                    <div className="card" style={{borderTop:"2px solid #2e7d32"}}>
                      <div className="card-title">المجموع مع بعض</div>
                      <div className="stat-val" style={{color:"#2e7d32",fontSize:36}}>{totalCombined}</div>
                      <div className="stat-sub">{data.length>0?((totalCombined/data.length)*100).toFixed(1):0}% من الكل</div>
                    </div>
                  </div>
                  <div className="grid2" style={{marginBottom:"2px"}}>
                    <div className="card" style={{borderTop:"2px solid #2e7d32"}}>
                      <div className="card-title">🏆 الأحسن (الأكتر)</div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontSize:32,color:"#2e7d32"}}>{best?.name||"—"}</div>
                      <div className="stat-sub" style={{marginTop:8}}>{best?.combined} سجل — {best?.total>0?((best.combined/best.total)*100).toFixed(1):0}% من أوردراته</div>
                    </div>
                    <div className="card" style={{borderTop:"2px solid #c62828"}}>
                      <div className="card-title">⚠️ الأسوأ (الأقل)</div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontSize:32,color:"#c62828"}}>{worst?.name||"—"}</div>
                      <div className="stat-sub" style={{marginTop:8}}>{worst?.combined} سجل — {worst?.total>0?((worst.combined/worst.total)*100).toFixed(1):0}% من أوردراته</div>
                    </div>
                  </div>
                  <div className="card" style={{marginBottom:"2px"}}>
                    <div className="card-title">تفاصيل كل أجنت</div>
                    <div style={{overflowX:"auto"}}>
                      <table className="table">
                        <thead><tr>
                          <th>Agent</th>
                          <th style={{color:"#0077aa"}}>Re-delivery</th><th style={{color:"#0077aa"}}>%</th>
                          <th style={{color:"#e06000"}}>Need Courier</th><th style={{color:"#e06000"}}>%</th>
                          <th style={{color:"#2e7d32"}}>المجموع</th><th style={{color:"#2e7d32"}}>% من أوردراته</th>
                        </tr></thead>
                        <tbody>
                          {agentCompare.map((a,i)=>(
                            <tr key={i}>
                              <td style={{color:COLORS[i%COLORS.length]}}>{a.name}</td>
                              <td style={{color:"#0077aa"}}>{a.countA}</td>
                              <td style={{color:"#0077aa99"}}>{a.total>0?((a.countA/a.total)*100).toFixed(1):0}%</td>
                              <td style={{color:"#e06000"}}>{a.countB}</td>
                              <td style={{color:"#e0600099"}}>{a.total>0?((a.countB/a.total)*100).toFixed(1):0}%</td>
                              <td style={{color:"#2e7d32",fontWeight:600}}>{a.combined}</td>
                              <td style={{color:"#2e7d32"}}>{a.total>0?((a.combined/a.total)*100).toFixed(1):0}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-title">Bar Chart مقارنة</div>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={agentCompare} barCategoryGap="25%">
                        <XAxis dataKey="name" tick={{fill:"#aaa",fontSize:10,fontFamily:"DM Mono"}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fill:"#bbb",fontSize:10,fontFamily:"DM Mono"}} axisLine={false} tickLine={false}/>
                        <Tooltip content={<CustomTooltip/>} cursor={{fill:"#00000004"}}/>
                        <Legend wrapperStyle={{fontSize:10,fontFamily:"DM Mono",color:"#888"}}/>
                        <Bar dataKey="countA" name="Re-delivery" fill="#0077aa" radius={[2,2,0,0]}/>
                        <Bar dataKey="countB" name="Need Courier" fill="#e06000" radius={[2,2,0,0]}/>
                        <Bar dataKey="combined" name="المجموع" fill="#2e7d32" radius={[2,2,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>);
              })()}
            </motion.div>
          )}

          {activeTab==="data" && (
            <motion.div key="data" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.3}}>
              <div className="add-btn-wrap" style={{gap:10,display:"flex",justifyContent:"flex-end",alignItems:"center"}}>
                {uploadMsg&&(
                  <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} style={{
                    fontSize:12,padding:"8px 16px",borderRadius:2,
                    background:uploadMsg.type==="success"?"#e8f5e9":"#ffebee",
                    border:`1px solid ${uploadMsg.type==="success"?"#a5d6a7":"#ef9a9a"}`,
                    color:uploadMsg.type==="success"?"#2e7d32":"#c62828",letterSpacing:1
                  }}>{uploadMsg.text}</motion.div>
                )}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handleExcelUpload}/>
                <button className="btn-ghost" onClick={()=>fileInputRef.current.click()}>↑ Upload Excel</button>
                <button className="btn-primary" onClick={()=>setShowForm(true)}>+ Add Record</button>
              </div>
              <div className="card">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                  <div className="card-title" style={{margin:0}}>All Records ({data.length})</div>
                  {data.length>0&&<button className="btn-danger" onClick={()=>setData([])}>Clear All</button>}
                </div>
                {data.length===0&&<div className="empty">// No records yet</div>}
                <div style={{overflowX:"auto"}}>
                  <table className="table">
                    <thead><tr><th>Date</th><th>Order Code</th><th>Agent</th><th>Final Feedback</th><th></th></tr></thead>
                    <tbody>
                      {data.map(r=>(
                        <tr key={r.id}>
                          <td>{r.exportDate}</td>
                          <td style={{color:"#0077aa"}}>{r.orderCode}</td>
                          <td style={{color:"#2e7d32"}}>{r.agent}</td>
                          <td style={{maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.feedback}</td>
                          <td><button className="btn-danger" onClick={()=>setDeleteId(r.id)}>Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
        )}

        <AnimatePresence>
          {showForm&&(
            <motion.div className="form-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
              <motion.div className="form-box" initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}>
                <div className="form-title">Add Record</div>
                <div className="field"><label>Export Date</label><input type="date" value={form.exportDate} onChange={e=>setForm(f=>({...f,exportDate:e.target.value}))}/></div>
                <div className="field"><label>Order Code</label><input type="text" placeholder="e.g. ORD-123" value={form.orderCode} onChange={e=>setForm(f=>({...f,orderCode:e.target.value}))}/></div>
                <div className="field"><label>Agent Name</label><input type="text" placeholder="e.g. Ahmed" value={form.agent} onChange={e=>setForm(f=>({...f,agent:e.target.value}))}/></div>
                <div className="field">
                  <label>Final Feedback</label>
                  <select value={form.feedback} onChange={e=>setForm(f=>({...f,feedback:e.target.value}))}>
                    <option value="">-- Select --</option>
                    {FEEDBACK_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:12,marginTop:24}}>
                  <button className="btn-primary" onClick={handleAdd}>Save</button>
                  <button className="btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {deleteId&&(
            <motion.div className="form-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
              <motion.div className="form-box" style={{width:360}} initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}>
                <div className="form-title" style={{color:"#c62828"}}>Delete Record?</div>
                <div style={{fontSize:13,color:"#888",marginBottom:28}}>هتتمسح البيانات دي ومش هترجع تاني.</div>
                <div style={{display:"flex",gap:12}}>
                  <button className="btn-primary" style={{background:"#c62828"}} onClick={()=>handleDelete(deleteId)}>Delete</button>
                  <button className="btn-ghost" onClick={()=>setDeleteId(null)}>Cancel</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

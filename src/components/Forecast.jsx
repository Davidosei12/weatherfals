import dayjs from "dayjs";

export default function Forecast({ daily, units }) {
  if (!daily?.length) return null;
  const unit = units==="metric" ? "C" : "F";
  return (
    <div className="card" style={{marginTop:12}}>
      <div style={{fontWeight:600, marginBottom:8}}>7-Day Forecast</div>
      <div className="grid">
        {daily.slice(1,8).map(d=>(
          <div key={d.dt} className="card">
            <div style={{fontWeight:600}}>{dayjs.unix(d.dt).format("ddd")}</div>
            <div className="muted">{dayjs.unix(d.dt).format("MMM D")}</div>
            <div style={{fontSize:28, fontWeight:700, marginTop:6}}>
              {Math.round(d.temp.max)}°{unit}
            </div>
            <div className="muted">Low {Math.round(d.temp.min)}°{unit}</div>
            <div style={{textTransform:"capitalize", marginTop:6}}>
              {d.weather?.[0]?.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

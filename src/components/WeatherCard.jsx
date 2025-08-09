import dayjs from "dayjs";

export default function WeatherCard({ place, current, units }) {
  if (!current) return null;
  const unit = units==="metric" ? "C" : "F";
  return (
    <div className="card">
      <div className="row" style={{justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:18, fontWeight:600}}>{place}</div>
          <div className="muted">{dayjs.unix(current.dt).format("ddd, MMM D — h:mm A")}</div>
        </div>
        <div className="temp">{Math.round(current.temp)}°{unit}</div>
      </div>
      <div className="row" style={{marginTop:8}}>
        <span style={{textTransform:"capitalize"}}>{current.weather?.[0]?.description}</span>
        <span className="muted">• Feels {Math.round(current.feels_like)}°{unit}</span>
        <span className="muted">• Humidity {current.humidity}%</span>
        <span className="muted">• Wind {Math.round(current.wind_speed)} {units==="metric"?"m/s":"mph"}</span>
      </div>
    </div>
  );
}

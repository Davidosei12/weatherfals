export default function UnitToggle({ units, setUnits }) {
  return (
    <div className="row" role="group" aria-label="Unit toggle">
      <button onClick={()=>setUnits("metric")} aria-pressed={units==="metric"}>
        °C
      </button>
      <button onClick={()=>setUnits("imperial")} aria-pressed={units==="imperial"}>
        °F
      </button>
    </div>
  );
}

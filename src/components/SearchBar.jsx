import { useState } from "react";

export default function SearchBar({ onSearch, initial="Accra" }) {
  const [q, setQ] = useState(initial);
  return (
    <div className="row">
      <input
        placeholder="Search city…"
        value={q}
        onChange={e=>setQ(e.target.value)}
        onKeyDown={e=>e.key==="Enter" && onSearch(q)}
        aria-label="Search city"
      />
      <button onClick={()=>onSearch(q)}>Search</button>
    </div>
  );
}

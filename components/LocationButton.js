"use client";

import { useState } from "react";

// Optional "share my location": fills hidden latitude/longitude fields
// from the phone's GPS. Nothing is sent until the form is submitted.
export default function LocationButton({ label, hint, savedLabel, failedLabel }) {
  const [coords, setCoords] = useState(null);
  const [failed, setFailed] = useState(false);

  function locate() {
    if (!navigator.geolocation) return setFailed(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFailed(false);
        setCoords({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) });
      },
      () => setFailed(true),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className="field">
      <button type="button" className="button" onClick={locate}>
        {label}
      </button>
      <small className="hint">{coords ? savedLabel : failed ? failedLabel : hint}</small>
      {coords && (
        <>
          <input type="hidden" name="latitude" value={coords.lat} />
          <input type="hidden" name="longitude" value={coords.lng} />
        </>
      )}
    </div>
  );
}

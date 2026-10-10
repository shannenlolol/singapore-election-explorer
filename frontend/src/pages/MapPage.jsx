// pages/MapPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import { getWinnerPct, formatVotePct } from "../features/map/resultModel.js";
import { normaliseConstituencyKey, getBoundaryName, getBoundaryResult, getBoundaryType } from "../features/map/boundaryModel.js";

function upperTrim(value) {
  return String(value || "").trim().toUpperCase();
}

function fitToGeo(map, geojson, leftInsetPx, transitionMs, shouldAnimate) {
  if (!map) return;
  if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
    return;
  }

  const layer = L.geoJSON(geojson);
  const bounds = layer.getBounds();
  if (!bounds || !bounds.isValid || !bounds.isValid()) return;

  const pad = 24;
  const leftPad = Math.max(0, Number(leftInsetPx || 0)) + pad;

  const durationSec = Number.isFinite(Number(transitionMs))
    ? Math.max(0.1, Number(transitionMs) / 1000)
    : 0.25;

  try {
    map.stop();
  } catch {
    // ignore
  }

  map.fitBounds(bounds, {
    paddingTopLeft: [leftPad, pad],
    paddingBottomRight: [pad, pad],
    animate: Boolean(shouldAnimate),
    duration: durationSec,
    maxZoom: 12,
  });
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function opacityFromWinnerPct(winnerPct) {
  const pct = Number(winnerPct);

  if (winnerPct == null || !Number.isFinite(pct)) {
    return 0.25;
  }

  // Focus the visual range on realistic winners:
  // 35% -> "very low opacity", 100% -> "very high opacity"
  const LOW = 35;
  const HIGH = 80;

  const t = clamp01((pct - LOW) / (HIGH - LOW));

  // Stronger contrast: higher gamma makes low % much more transparent
  const GAMMA = 1.8;
  const eased = Math.pow(t, GAMMA);

  // Wider opacity span
  const MIN_O = 0.06;
  const MAX_O = 0.96;

  return MIN_O + (MAX_O - MIN_O) * eased;
}


// Party colours
const PARTY_META = {
  PAP: { colour: "#E53935", name: "People's Action Party" },
  WP: { colour: "#1E88E5", name: "Workers' Party" },
  PSP: { colour: "#FB8C00", name: "Progress Singapore Party" },
  SDP: { colour: "#43A047", name: "Singapore Democratic Party" },
  NSP: { colour: "#00897B", name: "National Solidarity Party" },
  SPP: { colour: "#8E24AA", name: "Singapore People's Party" },
  PPP: { colour: "#D81B60", name: "People's Power Party" },
  RDU: { colour: "#5E35B1", name: "Red Dot United" },
  SDA: { colour: "#3949AB", name: "Singapore Democratic Alliance" },
  PAR: { colour: "#6D4C41", name: "People's Alliance for Reform" },
  SUP: { colour: "#FDD835", name: "Singapore United Party" },
  INDEPENDENT: { colour: "#546E7A", name: "Independent" },
};

function partyLabel(partyCode) {
  const key = upperTrim(partyCode);
  const meta = PARTY_META[key];
  return meta && meta.name ? meta.name : key;
}

function colourForParty(partyCode) {
  const key = upperTrim(partyCode);
  const meta = PARTY_META[key];
  if (meta && meta.colour) return meta.colour;

  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 75% 50%)`;
}

function TypeaheadSelectBox({
  value,
  options,
  onSelect,
  placeholder,
  direction,
  maxItems,
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(-1);

  const rootRef = React.useRef(null);
  const inputRef = React.useRef(null);

  const selectedKey = String(value || "ALL").trim().toUpperCase();

  const selectedLabel = React.useMemo(
    function () {
      const hit = options.find(function (o) {
        return String(o.key || "").trim().toUpperCase() === selectedKey;
      });
      return hit ? String(hit.label) : placeholder || "ALL";
    },
    [options, selectedKey, placeholder],
  );

  const limit = Number.isFinite(Number(maxItems)) ? Number(maxItems) : 120;

  const filtered = React.useMemo(
    function () {
      const q = String(query || "").trim().toUpperCase();

      const allOpt = options.find(function (o) {
        return String(o.key || "").toUpperCase() === "ALL";
      });

      const rest = options.filter(function (o) {
        return String(o.key || "").toUpperCase() !== "ALL";
      });

      if (!q) {
        return (allOpt ? [allOpt] : []).concat(rest.slice(0, limit));
      }

      const starts = [];
      const includes = [];

      for (const opt of rest) {
        const label = String(opt.label || "");
        const key = String(opt.key || "").toUpperCase();
        const labelUpper = label.toUpperCase();

        if (key.startsWith(q) || labelUpper.startsWith(q)) {
          starts.push(opt);
        } else if (key.indexOf(q) !== -1 || labelUpper.indexOf(q) !== -1) {
          includes.push(opt);
        }
      }

      starts.sort(function (a, b) {
        return String(a.label).localeCompare(String(b.label));
      });
      includes.sort(function (a, b) {
        return String(a.label).localeCompare(String(b.label));
      });

      const combined = starts.concat(includes).slice(0, limit);
      return (allOpt ? [allOpt] : []).concat(combined);
    },
    [options, query, limit],
  );

  React.useEffect(function () {
    function onDocDown(e) {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setIsOpen(false);
        setQuery("");
        setActiveIndex(-1);
      }
    }

    document.addEventListener("mousedown", onDocDown);
    return function () {
      document.removeEventListener("mousedown", onDocDown);
    };
  }, []);

  function openMenu() {
    setIsOpen(true);
    setQuery("");
    setActiveIndex(-1);
  }

  function closeMenu() {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  function commitSelect(item) {
    if (!item) return;
    if (typeof onSelect === "function") {
      onSelect(String(item.key));
    }
    closeMenu();
  }

  const inputValue = isOpen ? query : selectedLabel;

  return (
    <div ref={rootRef} className="selectbox-root">
      <input
        ref={inputRef}
        className="input selectbox-input"
        value={inputValue}
        placeholder={placeholder || "ALL"}
        onFocus={function () {
          openMenu();
        }}
        onClick={function () {
          if (!isOpen) openMenu();
        }}
        onChange={function (e) {
          if (!isOpen) setIsOpen(true);
          setQuery(String(e.target.value));
          setActiveIndex(-1);
        }}
        onKeyDown={function (e) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!isOpen) {
              openMenu();
              return;
            }
            setActiveIndex(function (prev) {
              const next = prev + 1;
              return next >= filtered.length ? 0 : next;
            });
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!isOpen) {
              openMenu();
              return;
            }
            setActiveIndex(function (prev) {
              const next = prev - 1;
              return next < 0 ? filtered.length - 1 : next;
            });
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (!isOpen) {
              openMenu();
              return;
            }
            const item = filtered[activeIndex] || filtered[0] || null;
            commitSelect(item);
          } else if (e.key === "Escape") {
            e.preventDefault();
            closeMenu();
            if (inputRef.current) inputRef.current.blur();
          }
        }}
      />

      {isOpen ? (
        <div
          className={
            direction === "down"
              ? "selectbox-menu selectbox-menu--down"
              : "selectbox-menu selectbox-menu--up"
          }
          role="listbox"
        >
          <div className="selectbox-items">
            {filtered.map(function (item, idx) {
              const isActive = idx === activeIndex;
              const isSelected = String(item.key || "").toUpperCase() === selectedKey;

              return (
                <button
                  key={item.key}
                  type="button"
                  className={
                    isActive
                      ? "selectbox-item active"
                      : isSelected
                        ? "selectbox-item selected"
                        : "selectbox-item"
                  }
                  onMouseEnter={function () {
                    setActiveIndex(idx);
                  }}
                  onMouseDown={function (e) {
                    e.preventDefault();
                  }}
                  onClick={function () {
                    commitSelect(item);
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarRecenterController({
  sidebarCollapsed,
  transitionMs,
  sidebarWidthPx,
  sidebarWidthDefault,
  handleWidth,
  geojsonPrimary,
  geojsonFallback,
}) {
  const map = useMap();

  React.useEffect(
    function () {
      function pickGeo() {
        if (geojsonPrimary && Array.isArray(geojsonPrimary.features) && geojsonPrimary.features.length > 0) {
          return geojsonPrimary;
        }
        if (geojsonFallback && Array.isArray(geojsonFallback.features) && geojsonFallback.features.length > 0) {
          return geojsonFallback;
        }
        return null;
      }

      function recenterNow() {
        const geo = pickGeo();
        if (!geo) return;

        let bounds = null;

        try {
          bounds = L.geoJSON(geo).getBounds();
        } catch {
          bounds = null;
        }

        if (!bounds || !bounds.isValid || !bounds.isValid()) return;

        try {
          map.invalidateSize({ animate: false, pan: false });
        } catch {
          // ignore
        }

        const pad = 24;

        const leftInset =
          sidebarCollapsed === true
            ? Math.max(0, Number(handleWidth || 0))
            : Math.max(0, Number(sidebarWidthPx || 0)) ||
              Math.max(0, Number(sidebarWidthDefault || 0));

        const leftPad = leftInset + pad;

        const ms = Number.isFinite(Number(transitionMs)) ? Number(transitionMs) : 0;
        const durationSec = ms > 0 ? Math.max(0.1, ms / 1000) : 0.25;

        map.fitBounds(bounds, {
          paddingTopLeft: [leftPad, pad],
          paddingBottomRight: [pad, pad],
          animate: true,
          duration: durationSec,
          maxZoom: 12,
        });
      }

      const rafId = window.requestAnimationFrame(function () {
        recenterNow();
      });

      const ms2 = Number.isFinite(Number(transitionMs)) ? Number(transitionMs) : 0;

      let timeoutId = null;
      if (ms2 > 0) {
        timeoutId = window.setTimeout(function () {
          recenterNow();
        }, ms2);
      }

      return function () {
        window.cancelAnimationFrame(rafId);
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      };
    },
    [
      map,
      sidebarCollapsed,
      transitionMs,
      sidebarWidthPx,
      sidebarWidthDefault,
      handleWidth,
      geojsonPrimary,
      geojsonFallback,
    ],
  );

  return null;
}

/* ---------------------------
   NEW: Toggle UI component
---------------------------- */
function BaseMapToggle({ value, onChange }) {
  const isSimple = value === "simple";

  return (
    <div className="basemap-toggle" role="group" aria-label="Base map style">
      <button
        type="button"
        className={isSimple ? "basemap-pill" : "basemap-pill is-active"}
        onClick={function () {
          if (typeof onChange === "function") onChange("default");
        }}
        aria-pressed={isSimple ? "false" : "true"}
      >
        Default
      </button>

      <button
        type="button"
        className={isSimple ? "basemap-pill is-active" : "basemap-pill"}
        onClick={function () {
          if (typeof onChange === "function") onChange("simple");
        }}
        aria-pressed={isSimple ? "true" : "false"}
      >
        Simple
      </button>
    </div>
  );
}

export default function MapPage() {
  const years = useMemo(function () {
    return [2025, 2020, 2015, 2011, 2006];
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const SIDEBAR_WIDTH = 380;
  const TRANSITION_MS = 240;
  const sidebarShellRef = useRef(null);
  const [sidebarWidthPx, setSidebarWidthPx] = useState(0);
  const HANDLE_WIDTH = 24;
  const leftInsetPx = sidebarCollapsed ? HANDLE_WIDTH : sidebarWidthPx || SIDEBAR_WIDTH;

  const [year, setYear] = useState(years.length > 0 ? years[0] : 2025);

  // NEW: basemap style toggle
  // "default" = normal OSM tiles
  // "simple"  = low-detail "Carto Light (no labels)" style
  const [baseMapStyle, setBaseMapStyle] = useState("default");

  // Filters
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [partyContestedFilter, setPartyContestedFilter] = useState("ALL");
  const [partyWinnerFilter, setPartyWinnerFilter] = useState("ALL");
  const [search, setSearch] = useState("ALL");

  // UI/State
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(false);

  // caches
  const [geoByYear, setGeoByYear] = useState({});
  const [summaryByYear, setSummaryByYear] = useState({});
  const [partiesByYear, setPartiesByYear] = useState({});

  const [mapInstance, setMapInstance] = useState(null);
  const sidebarRef = useRef(null);

  const DEFAULT_YEAR = years.length > 0 ? years[0] : 2025;

  const DEFAULT_TYPE = "ALL";
  const DEFAULT_CONTESTED = "ALL";
  const DEFAULT_WINNER = "ALL";
  const DEFAULT_CONSTITUENCY = "ALL";

  function resetFilters() {
    setYear(DEFAULT_YEAR);
    setTypeFilter(DEFAULT_TYPE);
    setPartyContestedFilter(DEFAULT_CONTESTED);
    setPartyWinnerFilter(DEFAULT_WINNER);
    setSearch(DEFAULT_CONSTITUENCY);
  }

  useEffect(() => {
    if (!Number.isFinite(year)) return;
    const controller = new AbortController();
    async function loadYear() {
      setLoading(true);
      setErrorText("");
      try {
        const responses = await Promise.all([
          fetch(`/api/boundaries?year=${year}`, { signal: controller.signal }),
          fetch(`/api/boundaries/summary?year=${year}`, { signal: controller.signal }),
        ]);
        const [geojson, details] = await Promise.all(responses.map(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || "Could not load map data.");
          return data;
        }));
        if (controller.signal.aborted) return;
        setGeoByYear(previous => ({ ...previous, [year]: geojson }));
        setSummaryByYear(previous => ({
          ...previous,
          [year]: new Map(Object.entries(details.summary || {}).map(([key, value]) => [normaliseConstituencyKey(key), value])),
        }));
        setPartiesByYear(previous => ({ ...previous, [year]: details.parties || [] }));
      } catch (error) {
        if (!controller.signal.aborted) setErrorText(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadYear();
    return () => controller.abort();
  }, [year]);

  const activeGeo = geoByYear[year] || null;
  const activeSummary = useMemo(() => summaryByYear[year] || new Map(), [summaryByYear, year]);
  const partyOptions = useMemo(() => partiesByYear[year] || [], [partiesByYear, year]);

  const legendParties = useMemo(
    function () {
      const list = Array.isArray(partyOptions) ? partyOptions.slice() : [];

      const seen = new Set();
      const cleaned = [];
      for (const p of list) {
        const k = upperTrim(p);
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        cleaned.push(k);
      }

      const head = [];
      const tail = [];

      for (const p of cleaned) {
        if (p === "PAP" || p === "WP") {
          head.push(p);
        } else {
          tail.push(p);
        }
      }

      head.sort(function (a, b) {
        const order = { PAP: 0, WP: 1 };
        return (order[a] ?? 99) - (order[b] ?? 99);
      });

      tail.sort(function (a, b) {
        return a.localeCompare(b);
      });

      return head.concat(tail);
    },
    [partyOptions],
  );

  const constituencyOptions = React.useMemo(
    function () {
      if (!activeGeo || !Array.isArray(activeGeo.features)) {
        return [];
      }

      const seen = new Set();
      const out = [];

      for (const f of activeGeo.features) {
        const props = f && f.properties ? f.properties : {};
        const label = getBoundaryName(props);
        const key = normaliseConstituencyKey(label);

        if (!key) continue;
        if (seen.has(key)) continue;

        seen.add(key);
        out.push({ key: key, label: String(label) });
      }

      out.sort(function (a, b) {
        return String(a.label).localeCompare(String(b.label));
      });

      return [{ key: "ALL", label: "ALL" }].concat(out);
    },
    [activeGeo],
  );

  const yearOptions = useMemo(
    function () {
      return years.map(function (y) {
        return { key: String(y), label: String(y) };
      });
    },
    [years],
  );

  const typeOptions = React.useMemo(function () {
    return [
      { key: "ALL", label: "ALL" },
      { key: "GRC", label: "GRC" },
      { key: "SMC", label: "SMC" },
    ];
  }, []);

  const partySelectOptions = React.useMemo(
    function () {
      const list = Array.isArray(partyOptions) ? partyOptions.slice() : [];
      const cleaned = [];
      const seen = new Set();

      for (const p of list) {
        const k = upperTrim(p);
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        cleaned.push(k);
      }

      cleaned.sort(function (a, b) {
        return a.localeCompare(b);
      });

      return [{ key: "ALL", label: "ALL" }].concat(
        cleaned.map(function (p) {
          return { key: p, label: p };
        }),
      );
    },
    [partyOptions],
  );

  useEffect(() => {
    function measure() {
      const el = sidebarShellRef.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      if (Number.isFinite(w)) {
        setSidebarWidthPx(Math.max(0, Math.round(w)));
      }
    }

    measure();
    window.addEventListener("resize", measure);

    let ro = null;
    if (typeof ResizeObserver !== "undefined" && sidebarShellRef.current) {
      ro = new ResizeObserver(() => {
        measure();
      });
      ro.observe(sidebarShellRef.current);
    }

    return () => {
      window.removeEventListener("resize", measure);
      if (ro) ro.disconnect();
    };
  }, []);

  const filteredGeo = useMemo(
    function () {
      if (!activeGeo || !Array.isArray(activeGeo.features)) {
        return null;
      }

      const qRaw = upperTrim(search);
      const q = qRaw === "ALL" ? "" : qRaw;

      const outFeatures = activeGeo.features.filter(function (f) {
        const props = f && f.properties ? f.properties : {};
        const displayName = getBoundaryName(props);
        const nameKey = normaliseConstituencyKey(displayName);
        const entry = getBoundaryResult(props, activeSummary);
        const inferredType = getBoundaryType(props, entry);

        if (q && nameKey.indexOf(q) === -1) {
          return false;
        }

        if (typeFilter !== "ALL") {
          if (inferredType !== typeFilter) {
            return false;
          }
        }

        if (partyContestedFilter !== "ALL") {
          const pKey = normaliseConstituencyKey(partyContestedFilter);
          if (!entry || !entry.parties || !entry.parties[pKey]) {
            return false;
          }
        }

        if (partyWinnerFilter !== "ALL") {
          const wKey = normaliseConstituencyKey(partyWinnerFilter);
          if (!entry || upperTrim(entry.winnerParty) !== wKey) {
            return false;
          }
        }

        return true;
      });

      if (outFeatures.length === 0) {
        return null;
      }

      return {
        ...activeGeo,
        features: outFeatures,
      };
    },
    [activeGeo, activeSummary, search, typeFilter, partyContestedFilter, partyWinnerFilter],
  );

  const refitMapNow = React.useCallback(
    function (shouldAnimate) {
      if (!mapInstance) return;

      const geoToFit =
        filteredGeo && Array.isArray(filteredGeo.features) && filteredGeo.features.length > 0
          ? filteredGeo
          : activeGeo;

      if (!geoToFit) return;

      try {
        mapInstance.invalidateSize({ animate: false, pan: false });
      } catch {
        // ignore
      }

      fitToGeo(mapInstance, geoToFit, leftInsetPx, TRANSITION_MS, shouldAnimate);
    },
    [mapInstance, filteredGeo, activeGeo, leftInsetPx, TRANSITION_MS],
  );

  useEffect(() => {
    if (!mapInstance) return;

    const raf = window.requestAnimationFrame(() => {
      refitMapNow(true);
    });

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [mapInstance, sidebarCollapsed, leftInsetPx, activeGeo, filteredGeo, refitMapNow]);

  useEffect(() => {
    const el = sidebarShellRef.current;
    if (!el) return;
    if (!mapInstance) return;

    function onEnd(e) {
      if (e.propertyName !== "transform") return;
      refitMapNow(true);
    }

    el.addEventListener("transitionend", onEnd);
    return () => {
      el.removeEventListener("transitionend", onEnd);
    };
  }, [mapInstance, refitMapNow]);

  const geoStyle = useMemo(
    function () {
      return function (feature) {
        const props = feature && feature.properties ? feature.properties : {};
        const entry = getBoundaryResult(props, activeSummary);
        const winner = entry && entry.winnerParty ? String(entry.winnerParty) : "";

        const baseFill = winner ? colourForParty(winner) : "#ffffff";
        const baseStroke = winner ? colourForParty(winner) : "#ffffff";

        const winnerPct = getWinnerPct(entry);
        const fillOpacity = winnerPct != null && Number.isFinite(Number(winnerPct))
          ? opacityFromWinnerPct(winnerPct)
          : 0.25;

        return {
          color: baseStroke,
          weight: 2,
          opacity: 1,
          fillColor: baseFill,
          fillOpacity: fillOpacity,
        };
      };
    },
    [activeSummary],
  );

  function onEachFeature(feature, layer) {
    const props = feature && feature.properties ? feature.properties : {};
    const displayName = getBoundaryName(props);

    const entry = getBoundaryResult(props, activeSummary);
    const inferredType = getBoundaryType(props, entry);
    const winner = entry && entry.winnerParty ? String(entry.winnerParty) : "Unknown";

    let partyLinesHtml = "";

    if (entry && entry.parties) {
      const parties = Object.keys(entry.parties);

      parties.sort(function (a, b) {
        const av = Number(entry.parties[a]?.votePct ?? -1);
        const bv = Number(entry.parties[b]?.votePct ?? -1);
        return bv - av;
      });

      partyLinesHtml = parties
        .map(function (p) {
          const pctText = formatVotePct(entry.parties[p]?.votePct);
          return `<div style="font-size:12px; margin-top:2px;"><b>${pctText}</b> ${p}</div>`;
        })
        .join("");
    }

    const html = `<div style="font-weight:800; margin-bottom:6px;">${displayName}</div>
      <div style="font-size:12px;">Year: <b>${year}</b></div>
      <div style="font-size:12px;">Type: <b>${inferredType || "Unknown"}</b></div>
      <div style="font-size:12px; margin-top:6px;">Winner: <b>${winner}</b></div>
      <div style="margin-top:6px;">${partyLinesHtml}</div>`;

    layer.bindTooltip(html, { sticky: true, direction: "auto" });

    const base = geoStyle(feature);

    layer.on("mouseover", function () {
      layer.setStyle({
        ...base,
        weight: 4,
        opacity: 1,
      });
    });

    layer.on("mouseout", function () {
      layer.setStyle(base);
    });
  }

  const matchedCount = filteredGeo && Array.isArray(filteredGeo.features) ? filteredGeo.features.length : 0;
  const totalCount = activeGeo && Array.isArray(activeGeo.features) ? activeGeo.features.length : 0;

  const handleX = sidebarCollapsed ? Math.round(HANDLE_WIDTH / 2) : sidebarWidthPx || SIDEBAR_WIDTH;

  const geoJsonKey = useMemo(
    function () {
      const q = upperTrim(search);
      const summarySize = activeSummary ? activeSummary.size : 0;

      return [
        year,
        typeFilter,
        upperTrim(partyContestedFilter),
        upperTrim(partyWinnerFilter),
        q,
        summarySize,
        matchedCount,
      ].join("|");
    },
    [year, typeFilter, partyContestedFilter, partyWinnerFilter, search, activeSummary, matchedCount],
  );


  // "Default" base layer
  const TILE_DEFAULT = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  // "Simple" base layer
  const cartoKey = import.meta.env.VITE_CARTO_BASEMAP_API_KEY;
  const TILE_SIMPLE =
    `https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`;

  const tileUrl = baseMapStyle === "simple" ? TILE_SIMPLE : TILE_DEFAULT;

  return (
    <div
      style={{
        position: "relative",
        height: "calc(100dvh - var(--header-height, 82px))",
        width: "100%",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }}
      >
        <MapContainer
          center={[1.32, 103.8198]}
          zoom={10.5}
          style={{ height: "100%", width: "100%" }}
          whenCreated={function (map) {
            setMapInstance(map);
          }}
        >
          <SidebarRecenterController
            sidebarCollapsed={sidebarCollapsed}
            transitionMs={TRANSITION_MS}
            sidebarWidthPx={sidebarWidthPx}
            sidebarWidthDefault={SIDEBAR_WIDTH}
            handleWidth={HANDLE_WIDTH}
            geojsonPrimary={filteredGeo}
            geojsonFallback={activeGeo}
          />

          {/* Base map toggles between Default and Simple */}
          <TileLayer
            attribution={
              baseMapStyle === "simple"
                ? "&copy; OpenStreetMap contributors &copy; CARTO"
                : "&copy; OpenStreetMap contributors"
            }
            url={tileUrl}
          />

          {filteredGeo ? (
            <GeoJSON key={geoJsonKey} data={filteredGeo} style={geoStyle} onEachFeature={onEachFeature} />
          ) : null}
        </MapContainer>

        {/* NEW: basemap toggle on top-right */}
{/* basemap toggle floating top-right */}
<div
  className="basemap-toggle-wrap"
  aria-label="Base map style toggle"
  style={{
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 9600,
    pointerEvents: "none",
  }}
>
  <div style={{ pointerEvents: "auto" }}>
    <BaseMapToggle
      value={baseMapStyle}
      onChange={function (next) {
        setBaseMapStyle(String(next));
      }}
    />
  </div>
</div>


        {/* Legend */}
        <div className="map-legend" aria-label="Party legend">
          <div className="map-legend-title">Party colours</div>
          <div className="map-legend-grid">
            {legendParties.map(function (p) {
              return (
                <div key={p} className="map-legend-item" title={partyLabel(p)}>
                  <span className="map-legend-dot" style={{ background: colourForParty(p) }} />
                  <span className="map-legend-code">{p}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sidebar overlay layer */}
      <div
        ref={sidebarShellRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: `min(${SIDEBAR_WIDTH}px, calc(100vw - 40px))`,
          zIndex: 9000,
          transform: sidebarCollapsed ? `translateX(-${SIDEBAR_WIDTH}px)` : "translateX(0px)",
          transition: `transform ${TRANSITION_MS}ms ease`,
        }}
      >
        <aside
          ref={sidebarRef}
          style={{
            height: "100%",
            width: "100%",
            background: "var(--surface)",
            color: "var(--text)",
            borderRight: "1px solid var(--border)",
            boxShadow: "var(--shadow)",
          }}
          className="h-full rounded-r-2xl"
        >
          {sidebarCollapsed ? null : (
            <div className="map-filters-inner">
              <div className="map-sidebar-top">
                <div className="map-sidebar-top-row">
                  <div className="map-sidebar-title">Filters</div>
                  <button type="button" className="filters-reset-btn" onClick={resetFilters} title="Reset filters">
                    Reset
                  </button>
                </div>
              </div>

              <div className="map-sidebar-body">
                <div className="field">
                  <div className="label">Year</div>
                  <TypeaheadSelectBox
                    value={String(year)}
                    options={yearOptions}
                    placeholder={String(year)}
                    direction="down"
                    onSelect={function (picked) {
                      const n = Number(picked);
                      if (Number.isFinite(n)) {
                        setYear(n);
                      }
                    }}
                  />
                </div>

                <div className="field">
                  <div className="label">Constituency type</div>
                  <TypeaheadSelectBox
                    value={typeFilter}
                    options={typeOptions}
                    placeholder="ALL"
                    direction="down"
                    onSelect={function (picked) {
                      setTypeFilter(String(picked));
                    }}
                  />
                </div>

                <div className="field">
                  <div className="label">Contested Party</div>
                  <TypeaheadSelectBox
                    value={partyContestedFilter}
                    options={partySelectOptions}
                    placeholder="ALL"
                    direction="up"
                    onSelect={function (picked) {
                      setPartyContestedFilter(String(picked));
                    }}
                  />
                </div>

                <div className="field">
                  <div className="label">Winner Party</div>
                  <TypeaheadSelectBox
                    value={partyWinnerFilter}
                    options={partySelectOptions}
                    placeholder="ALL"
                    direction="up"
                    onSelect={function (picked) {
                      setPartyWinnerFilter(String(picked));
                    }}
                  />
                </div>

                <div className="field">
                  <div className="label">Constituency</div>
                  <TypeaheadSelectBox
                    value={search}
                    options={constituencyOptions}
                    placeholder="ALL"
                    direction="up"
                    onSelect={function (pickedKey) {
                      setSearch(String(pickedKey));
                    }}
                  />
                </div>

                <div className="map-sidebar-status" style={{ marginTop: 12 }}>
                  {loading ? <div>Loading data…</div> : null}
                  {errorText ? <div style={{ color: "crimson" }}>{errorText}</div> : null}

                  {!loading && !errorText ? (
                    <div>
                      Matched areas: <b>{matchedCount}</b> / <b>{totalCount}</b>.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Collapse handle */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          transform: `translateX(${handleX}px) translateY(-50%)`,
          transition: `transform ${TRANSITION_MS}ms ease`,
          zIndex: 9500,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          onClick={function () {
            setSidebarCollapsed(function (prev) {
              return !prev;
            });
          }}
          aria-label={sidebarCollapsed ? "Open panel" : "Collapse panel"}
          title={sidebarCollapsed ? "Open panel" : "Collapse panel"}
          style={{
            pointerEvents: "auto",
            height: 56,
            width: HANDLE_WIDTH,
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow)",
            cursor: "pointer",
            transform: "translateX(-50%)",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: 18,
              fontWeight: 700,
              lineHeight: "56px",
              color: "var(--text)",
              textAlign: "center",
            }}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </span>
        </button>
      </div>
    </div>
  );
}

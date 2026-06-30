import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../context/LocationContext';
import { useProfile } from '../context/ProfileContext';
import { getStoredForecasts, setStoredForecasts } from '../context/ForecastStore';
import { fetchSpotData } from '../services/api';
import { computeSpotForecast } from '../utils/scoring';
import { getFavorites } from '../services/favorites';
import SPOTS from '../data/spots';
import { SpotForecast } from '../types';
import { scoreColor, scoreShort } from '../theme';
import { MapScreenProps } from '../navigation/types';
import { log } from '../utils/logger';
import { useI18n } from '../i18n';

interface MapSpot {
  lat: number;
  lon: number;
  name: string;
  region: string;
  country: string;
  id: string;
  level: string;
  hasData: boolean;
  score: string;
  color: string;
  label: string;
  swell: string;
  wind: string;
  fav: boolean;
}

function buildAllMapSpots(
  forecastMap: Map<string, SpotForecast>,
  levelColors: Record<string, string>,
  fallbackColor: string,
  favSet: Set<string>,
  t?: any,
): MapSpot[] {
  return SPOTS.map((spot) => {
    const fav = favSet.has(spot.id);
    const f = forecastMap.get(spot.id);
    if (f && f.currentCondition) {
      return {
        lat: spot.latitude, lon: spot.longitude, name: spot.name,
        region: spot.region, country: spot.country, id: spot.id,
        level: spot.recommendedLevel, hasData: true,
        score: f.currentScore.toFixed(1), color: scoreColor(f.currentScore),
        label: scoreShort(f.currentScore, t),
        swell: f.currentCondition.swellHeight.toFixed(1) + 'm',
        wind: f.currentCondition.windSpeed.toFixed(0) + ' km/h',
        fav,
      };
    }
    const levelLabels: Record<string, string> = { beginner: 'B', intermediate: 'I', expert: 'E' };
    return {
      lat: spot.latitude, lon: spot.longitude, name: spot.name,
      region: spot.region, country: spot.country, id: spot.id,
      level: spot.recommendedLevel, hasData: false, score: '—',
      color: levelColors[spot.recommendedLevel] || fallbackColor,
      label: levelLabels[spot.recommendedLevel] || '?',
      swell: '—', wind: '—',
      fav,
    };
  });
}

function getCountryBounds(country: string): { lat: number; lon: number }[] {
  return SPOTS.filter(s => s.country === country).map(s => ({ lat: s.latitude, lon: s.longitude }));
}

interface MapLabels {
  viewDetails: string;
  loadConditions: string;
  noData: string;
  loading: string;
  retry: string;
}

interface MapThemeStyle {
  textColor: string;
  borderColor: string;
  popupShadow: string;
  labelShadow: string;
  recenterBorder: string;
  accentDim: string;
  clusterInner: string;
  clusterText: string;
  clusterNeutral: string;
  favColor: string;
  userPin: string;
  scoreText: string;
}

function buildMapHtml(
  spots: MapSpot[],
  tileSrc: string,
  bgColor: string,
  accentColor: string,
  seaColor: string,
  themeStyle: MapThemeStyle,
  userLat?: number,
  userLon?: number,
  focusBounds?: { lat: number; lon: number }[],
  mapFilter?: string,
  focusSpotCenter?: { lat: number; lon: number },
  labels?: MapLabels,
): string {
  const lbl = labels ?? { viewDetails: 'View details', loadConditions: 'Load conditions', noData: 'Conditions not loaded', loading: 'Loading...', retry: 'Error - Retry' };
  const spotsJson = JSON.stringify(spots);

  let initView: string;
  if (focusSpotCenter) {
    initView = `map.setView([${focusSpotCenter.lat}, ${focusSpotCenter.lon}], 11);`;
  } else if (focusBounds && focusBounds.length > 0) {
    const boundsJson = JSON.stringify(focusBounds.map(b => [b.lat, b.lon]));
    initView = `map.fitBounds(${boundsJson}, { padding: [40, 40], maxZoom: 8 });`;
  } else if (userLat != null && userLon != null) {
    initView = `map.setView([${userLat}, ${userLon}], 5);`;
  } else {
    initView = `map.setView([25, 0], 2);`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: ${seaColor}; }
  #map { width: 100vw; height: 100vh; background: ${seaColor}; ${mapFilter ? `filter: ${mapFilter};` : ''} }
  .leaflet-container { background: ${seaColor} !important; }
  .leaflet-popup-content-wrapper {
    background: ${bgColor} !important; color: ${themeStyle.textColor} !important;
    border-radius: 14px !important; border: 1px solid ${themeStyle.borderColor};
    box-shadow: ${themeStyle.popupShadow} !important;
  }
  .leaflet-popup-tip { background: ${bgColor} !important; }
  .popup-title { font-size: 15px; font-weight: 800; margin-bottom: 3px; color: ${themeStyle.textColor}; }
  .popup-region { font-size: 11px; opacity: 0.6; margin-bottom: 6px; color: ${themeStyle.textColor}; }
  .popup-score { font-size: 20px; font-weight: 900; margin-bottom: 2px; }
  .popup-label { font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .popup-row { display: flex; gap: 12px; font-size: 13px; opacity: 0.75; margin-top: 6px; color: ${themeStyle.textColor}; }
  .popup-nodata { font-size: 12px; opacity: 0.6; margin-top: 6px; font-style: italic; color: ${themeStyle.textColor}; }
  .popup-loading { font-size: 12px; color: ${accentColor}; margin-top: 6px; font-weight: 600; }
  .popup-btn {
    display: block; margin-top: 10px; padding: 8px; border-radius: 10px;
    background: ${themeStyle.accentDim}; color: ${accentColor}; text-align: center;
    font-weight: 700; font-size: 13px; cursor: pointer; border: none; width: 100%;
  }
  .popup-btn:disabled { opacity: 0.4; }
  .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
    background: ${themeStyle.accentDim} !important;
  }
  .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
    background: ${themeStyle.clusterInner} !important;
    color: ${themeStyle.clusterText} !important; font-weight: 800 !important; font-size: 13px !important;
  }
  .recenter-btn {
    position: fixed; bottom: 24px; right: 16px; z-index: 9999;
    width: 44px; height: 44px; border-radius: 22px;
    background: ${bgColor}; border: 2px solid ${themeStyle.recenterBorder};
    display: flex; align-items: center; justify-content: center;
    box-shadow: ${themeStyle.popupShadow}; cursor: pointer;
    font-size: 20px; color: ${accentColor};
  }
  .recenter-btn:active { opacity: 0.7; }
</style>
</head>
<body>
<div id="map"></div>
<button id="recenterBtn" class="recenter-btn" style="${(userLat != null && userLon != null) ? '' : 'display:none'}" onclick="recenter()">&#x1f4cd;</button>
<script>
var USER_LAT = ${userLat ?? 'null'};
var USER_LON = ${userLon ?? 'null'};
var LABELS = ${JSON.stringify(lbl)};
var LABEL_COLOR = '${themeStyle.textColor}';
var LABEL_SHADOW = '${themeStyle.labelShadow}';
var spotMarkers = {};

var FAV_COLOR = '${themeStyle.favColor}';
var CLUSTER_NEUTRAL = '${themeStyle.clusterNeutral}';
var CLUSTER_TEXT = '${themeStyle.clusterText}';
var SCORE_TEXT = '${themeStyle.scoreText}';

// Mirror of theme.scoreColor so cluster bubbles & markers share the exact ramp.
function scoreColorJs(s) {
  s = Math.max(0, Math.min(10, s));
  function lc(r1,g1,b1,r2,g2,b2,t){return 'rgb('+Math.round(r1+(r2-r1)*t)+','+Math.round(g1+(g2-g1)*t)+','+Math.round(b1+(b2-b1)*t)+')';}
  if (s <= 2.5) return lc(228,82,76,255,138,80,s/2.5);
  if (s <= 5.0) return lc(255,138,80,255,200,70,(s-2.5)/2.5);
  if (s <= 7.5) return lc(255,200,70,52,184,96,(s-5.0)/2.5);
  return lc(52,184,96,35,199,194,(s-7.5)/2.5);
}

var map = L.map('map', { zoomControl: false, attributionControl: false });
// noWrap keeps a single world copy so spot markers (which only exist on the
// primary copy) don't disappear when panning into a repeated map.
L.tileLayer('${tileSrc}', { maxZoom: 18, noWrap: true }).addTo(map);
${initView}

// User marker is set/moved imperatively so the map never reloads when GPS
// resolves after first paint — we just drop or move the pin via injectJavaScript.
var userMarker = null;
function setUserLocation(lat, lon, doCenter) {
  USER_LAT = lat; USER_LON = lon;
  if (userMarker) {
    userMarker.setLatLng([lat, lon]);
  } else {
    var userIcon = L.divIcon({
      className: 'user-icon',
      html: '<div style="width:18px;height:18px;border-radius:50%;background:${themeStyle.userPin};border:3px solid white;box-shadow:0 2px 10px rgba(74,144,255,0.6)"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9]
    });
    userMarker = L.marker([lat, lon], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
  }
  var rb = document.getElementById('recenterBtn');
  if (rb) rb.style.display = 'flex';
  if (doCenter) map.setView([lat, lon], 8, { animate: true });
}

if (USER_LAT !== null) { setUserLocation(USER_LAT, USER_LON, false); }

function recenter() {
  if (USER_LAT !== null) map.setView([USER_LAT, USER_LON], 8, { animate: true });
}

function makePopup(s) {
  if (s.hasData) {
    return '<div>' +
      '<div class="popup-title">' + s.name + '</div>' +
      '<div class="popup-region">' + s.region + ' \\u00b7 ' + s.country + '</div>' +
      '<div class="popup-score" style="color:' + s.color + '">' + s.score + '/10</div>' +
      '<div class="popup-label" style="color:' + s.color + '">' + s.label + '</div>' +
      '<div class="popup-row"><span>\\ud83c\\udf0a ' + s.swell + '</span><span>\\ud83d\\udca8 ' + s.wind + '</span></div>' +
      '<button class="popup-btn" onclick="sendMsg(\\'detail\\',\\'' + s.id + '\\')">' + LABELS.viewDetails + '</button></div>';
  }
  return '<div>' +
    '<div class="popup-title">' + s.name + '</div>' +
    '<div class="popup-region">' + s.region + ' \\u00b7 ' + s.country + '</div>' +
    '<div class="popup-nodata">' + LABELS.noData + '</div>' +
    '<button class="popup-btn" id="btn-' + s.id + '" onclick="sendMsg(\\'load\\',\\'' + s.id + '\\')">' + LABELS.loadConditions + '</button></div>';
}

function sendMsg(action, id) {
  if (action === 'load') {
    var btn = document.getElementById('btn-' + id);
    if (btn) { btn.disabled = true; btn.textContent = LABELS.loading; }
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({action: action, id: id}));
}

// Star badge shown on favorite spots so they pop out without zooming in.
function favStar(isFav) {
  return isFav
    ? '<div style="position:absolute;top:-7px;right:-7px;width:15px;height:15px;border-radius:50%;background:' + FAV_COLOR + ';color:#0B0F1A;font-size:10px;font-weight:900;line-height:15px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.4)">\\u2605</div>'
    : '';
}

function updateSpot(data) {
  var entry = spotMarkers[data.id];
  if (!entry) return;
  var s = data;
  s.fav = entry.data.fav;
  var border = s.fav ? '2px solid ' + FAV_COLOR : 'none';
  var icon = L.divIcon({
    className: 'spot-div-icon',
    html: '<div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto">' +
      '<div style="position:relative;padding:3px 7px;border-radius:10px;font-size:13px;font-weight:800;color:' + SCORE_TEXT + ';text-align:center;min-width:36px;background:' + s.color + ';border:' + border + ';box-shadow:0 2px 8px rgba(0,0,0,0.3)">' + s.score + favStar(s.fav) + '</div>' +
      '<div style="margin-top:2px;font-size:9px;color:' + LABEL_COLOR + ';font-weight:600;text-shadow:' + LABEL_SHADOW + ';white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis">' + s.name + '</div></div>',
    iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -28]
  });
  entry.marker.setIcon(icon);
  s.hasData = true;
  entry.data = s;
  entry.marker.options.swData = s;
  entry.marker.setPopupContent(makePopup(s));
}

var spots = ${spotsJson};
var clusters = L.markerClusterGroup({
  maxClusterRadius: 50, spiderfyOnMaxZoom: true,
  showCoverageOnHover: false, zoomToBoundsOnClick: true,
  disableClusteringAtZoom: 10,
  // Colour each cluster by the BEST score it contains, so quality is visible
  // without zooming in. Neutral grey when no spot in the cluster has data yet.
  iconCreateFunction: function(cluster) {
    var markers = cluster.getAllChildMarkers();
    var best = null, favCount = 0;
    for (var i = 0; i < markers.length; i++) {
      var d = markers[i].options.swData;
      if (!d) continue;
      if (d.fav) favCount++;
      if (d.hasData) {
        var sc = parseFloat(d.score);
        if (!isNaN(sc) && (best === null || sc > best)) best = sc;
      }
    }
    var count = markers.length;
    var size = count < 10 ? 34 : (count < 50 ? 40 : 46);
    var bg = best !== null ? scoreColorJs(best) : CLUSTER_NEUTRAL;
    var txt = best !== null ? SCORE_TEXT : CLUSTER_TEXT;
    var ring = favCount > 0 ? FAV_COLOR : 'rgba(255,255,255,0.55)';
    var ringW = favCount > 0 ? '3px' : '2px';
    return L.divIcon({
      className: 'sw-cluster',
      html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + bg + ';border:' + ringW + ' solid ' + ring + ';display:flex;align-items:center;justify-content:center;color:' + txt + ';font-weight:800;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.35)">' + count + '</div>',
      iconSize: [size, size]
    });
  }
});

spots.forEach(function(s) {
  var pin;
  if (s.hasData) {
    var bd = s.fav ? '2px solid ' + FAV_COLOR : 'none';
    pin = '<div style="position:relative;padding:3px 7px;border-radius:10px;font-size:13px;font-weight:800;color:' + SCORE_TEXT + ';text-align:center;min-width:36px;background:' + s.color + ';border:' + bd + ';box-shadow:0 2px 8px rgba(0,0,0,0.3)">' + s.score + favStar(s.fav) + '</div>';
  } else {
    // Unloaded spot: clean accent ring (no cryptic B/I/E letter, no dead grey).
    // Reads as "tap to load conditions". Center filled with the map bg so it
    // stays visible on any tile.
    var ringColor = s.fav ? FAV_COLOR : '${accentColor}';
    pin = '<div style="position:relative;width:12px;height:12px;border-radius:50%;background:${bgColor};border:2.5px solid ' + ringColor + ';box-shadow:0 1px 4px rgba(0,0,0,0.3)">' + favStar(s.fav) + '</div>';
  }
  var opacity = s.hasData ? '1' : '0.85';

  var icon = L.divIcon({
    className: 'spot-div-icon',
    html: '<div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;opacity:' + opacity + '">' +
      pin +
      '<div style="margin-top:2px;font-size:9px;color:' + LABEL_COLOR + ';font-weight:600;text-shadow:' + LABEL_SHADOW + ';white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis">' + s.name + '</div></div>',
    iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -28]
  });

  var marker = L.marker([s.lat, s.lon], { icon: icon, swData: s })
    .bindPopup(makePopup(s), { closeButton: false, minWidth: 170 });
  spotMarkers[s.id] = { marker: marker, data: s };
  clusters.addLayer(marker);
});

map.addLayer(clusters);
</script>
</body>
</html>`;
}

export default function MapScreen({ navigation, route }: MapScreenProps) {
  const { colors, isDark } = useTheme();
  const { profile } = useProfile();
  const { location } = useLocation();
  const { t, locale } = useI18n();
  const [mapLoading, setMapLoading] = useState(true);
  const [loadingSpot, setLoadingSpot] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(() => getStoredForecasts().length);
  const webviewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const forecastsRef = useRef<SpotForecast[]>(getStoredForecasts());
  // null = not loaded yet; we gate the map build on it so favorites are drawn
  // on first paint (no WebView reload flash).
  const [favIds, setFavIds] = useState<string[] | null>(null);

  useEffect(() => {
    getFavorites().then(setFavIds).catch(() => setFavIds([]));
  }, []);

  const focusCountry = route.params?.focusCountry;
  const focusSpotId = route.params?.focusSpotId;

  const initialForecastMap = useMemo(() => {
    const m = new Map<string, SpotForecast>();
    for (const f of forecastsRef.current) m.set(f.spot.id, f);
    return m;
  }, []);

  const levelColors = useMemo(
    () => ({ beginner: colors.blue, intermediate: colors.yellow, expert: colors.red }),
    [colors.blue, colors.yellow, colors.red],
  );
  const favSet = useMemo(() => new Set(favIds ?? []), [favIds]);
  const initialSpots = useMemo(
    () => buildAllMapSpots(initialForecastMap, levelColors, colors.textMuted, favSet, t),
    [initialForecastMap, levelColors, colors.textMuted, favSet, t],
  );

  const focusBounds = useMemo(() => {
    if (focusSpotId) return undefined;
    if (!focusCountry) return undefined;
    const bounds = getCountryBounds(focusCountry);
    return bounds.length > 0 ? bounds : undefined;
  }, [focusCountry, focusSpotId]);

  const focusSpotCenter = useMemo(() => {
    if (!focusSpotId) return undefined;
    const spot = SPOTS.find(s => s.id === focusSpotId);
    return spot ? { lat: spot.latitude, lon: spot.longitude } : undefined;
  }, [focusSpotId]);

  const mapLabels: MapLabels = useMemo(() => ({
    viewDetails: t.mapViewDetails,
    loadConditions: t.mapLoadConditions,
    noData: t.mapNoData,
    loading: t.mapLoading,
    retry: t.mapRetry,
  }), [t]);

  const themeStyle = useMemo(() => ({
    textColor: colors.text,
    borderColor: colors.border,
    popupShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.15)',
    labelShadow: isDark
      ? '0 1px 3px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.6)'
      : '0 1px 2px rgba(255,255,255,0.95), 0 0 4px rgba(255,255,255,0.7)',
    recenterBorder: colors.border,
    accentDim: colors.accentDim,
    clusterInner: isDark ? 'rgba(0,212,170,0.6)' : 'rgba(0,184,148,0.65)',
    clusterText: '#FFFFFF',
    clusterNeutral: isDark ? 'rgba(120,130,150,0.85)' : 'rgba(90,100,120,0.85)',
    favColor: colors.yellow,
    userPin: colors.blue,
    scoreText: '#0B0F1A',
  }), [colors.text, colors.border, colors.accentDim, colors.blue, colors.yellow, isDark]);

  // Snapshot the location at mount: the map HTML must NOT depend on `location`,
  // otherwise the WebView fully reloads (re-fetching Leaflet + re-creating 100
  // markers) every time the GPS fix changes. Live updates go through
  // `setUserLocation` injection below instead.
  const initialLocRef = useRef(location);
  const userInjected = useRef(false);

  const html = useMemo(
    () => buildMapHtml(initialSpots, colors.mapTile, colors.bg, colors.accent, colors.mapSea, themeStyle, initialLocRef.current?.latitude, initialLocRef.current?.longitude, focusBounds, colors.mapFilter, focusSpotCenter, mapLabels),
    [initialSpots, colors.mapTile, colors.bg, colors.accent, colors.mapSea, themeStyle, focusBounds, colors.mapFilter, focusSpotCenter, mapLabels],
  );

  // Push the user pin into the already-mounted map when the fix resolves (or
  // moves). Center on the user only the first time, and never when the map was
  // opened focused on a specific spot/country.
  useEffect(() => {
    if (!location) return;
    const first = !userInjected.current;
    userInjected.current = true;
    const doCenter = first && !focusCountry && !focusSpotId;
    webviewRef.current?.injectJavaScript(
      `setUserLocation(${location.latitude}, ${location.longitude}, ${doCenter ? 'true' : 'false'}); true;`,
    );
  }, [location, focusCountry, focusSpotId]);

  const buildUpdateData = useCallback((forecast: SpotForecast) => ({
    id: forecast.spot.id,
    name: forecast.spot.name,
    region: forecast.spot.region,
    country: forecast.spot.country,
    score: forecast.currentScore.toFixed(1),
    color: scoreColor(forecast.currentScore),
    label: scoreShort(forecast.currentScore, t),
    swell: forecast.currentCondition ? forecast.currentCondition.swellHeight.toFixed(1) + 'm' : '—',
    wind: forecast.currentCondition ? forecast.currentCondition.windSpeed.toFixed(0) + ' km/h' : '—',
  }), [t]);

  // When other tabs load spots into the shared store, refresh the map markers on
  // focus so scores aren't stale (the map mounts once and otherwise never syncs).
  useFocusEffect(
    useCallback(() => {
      const stored = getStoredForecasts();
      if (stored.length === 0) return;
      const known = new Set(forecastsRef.current.map(f => f.spot.id));
      const fresh = stored.filter(f => !known.has(f.spot.id));
      if (fresh.length === 0 && stored.length === forecastsRef.current.length) return;
      forecastsRef.current = stored;
      setLoadedCount(stored.length);
      for (const forecast of fresh) {
        webviewRef.current?.injectJavaScript(`updateSpot(${JSON.stringify(buildUpdateData(forecast))}); true;`);
      }
    }, [buildUpdateData]),
  );

  const loadSpotOnMap = useCallback(async (spotId: string) => {
    const spot = SPOTS.find(s => s.id === spotId);
    if (!spot) return;
    setLoadingSpot(spotId);
    try {
      const { marine, weather } = await fetchSpotData(spot.latitude, spot.longitude, { daily: false });
      const forecast = computeSpotForecast(spot, marine, weather, profile, locale);

      forecastsRef.current = [...forecastsRef.current.filter(f => f.spot.id !== spotId), forecast]
        .sort((a, b) => b.currentScore - a.currentScore);
      setStoredForecasts(forecastsRef.current);
      setLoadedCount(forecastsRef.current.length);

      webviewRef.current?.injectJavaScript(`updateSpot(${JSON.stringify(buildUpdateData(forecast))}); true;`);
    } catch {
      webviewRef.current?.injectJavaScript(`
        var btn = document.getElementById('btn-${spotId}');
        if (btn) { btn.disabled = false; btn.textContent = LABELS.retry; }
        true;
      `);
    } finally {
      setLoadingSpot(null);
    }
  }, [profile, locale, buildUpdateData]);

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.action === 'detail') {
        const f = forecastsRef.current.find(fc => fc.spot.id === msg.id);
        if (f) {
          navigation.navigate('SpotDetail', { forecast: f });
        }
      } else if (msg.action === 'load') {
        loadSpotOnMap(msg.id);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      log.warn('Map message parse error:', msg);
    }
  }, [navigation, loadSpotOnMap]);

  const onWebViewLoaded = useCallback(() => {
    setMapLoading(false);
    // Make sure the pin is present even if the fix resolved before the page
    // finished loading (the earlier inject would have been a no-op).
    if (location) {
      const doCenter = !userInjected.current && !focusCountry && !focusSpotId;
      userInjected.current = true;
      webviewRef.current?.injectJavaScript(
        `setUserLocation(${location.latitude}, ${location.longitude}, ${doCenter ? 'true' : 'false'}); true;`,
      );
    }
  }, [location, focusCountry, focusSpotId]);

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={s.hCenter}>
          <Text style={[s.title, { color: colors.white }]}>
            {focusSpotId ? SPOTS.find(s => s.id === focusSpotId)?.name : focusCountry ? focusCountry : t.mapTitle}
          </Text>
          <Text style={[s.hSub, { color: colors.white40 }]}>
            {t.mapLoaded(SPOTS.length, loadedCount)}
            {loadingSpot ? ` · ${t.mapLoadingSpot}` : ''}
          </Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {favIds !== null && (
          <WebView
            ref={webviewRef}
            source={{ html }}
            style={{ flex: 1, backgroundColor: colors.bg }}
            originWhitelist={['https://*', 'http://*']}
            javaScriptEnabled
            onMessage={onMessage}
            onLoadEnd={onWebViewLoaded}
            scrollEnabled={false}
            bounces={false}
          />
        )}
        {mapLoading && (
          <View style={[s.loaderOverlay, { backgroundColor: colors.bg }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[s.loaderTxt, { color: colors.white40 }]}>{t.mapLoadingMap}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8,
  },
  hCenter: { alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  hSub: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  loaderOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  loaderTxt: { marginTop: 12, fontSize: 13, fontWeight: '500' },
});

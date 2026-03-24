import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../context/LocationContext';
import { useProfile } from '../context/ProfileContext';
import { getStoredForecasts, setStoredForecasts } from '../context/ForecastStore';
import { fetchSpotData } from '../services/api';
import { computeSpotForecast } from '../utils/scoring';
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
}

function buildAllMapSpots(forecastMap: Map<string, SpotForecast>): MapSpot[] {
  return SPOTS.map((spot) => {
    const f = forecastMap.get(spot.id);
    if (f && f.currentCondition) {
      return {
        lat: spot.latitude, lon: spot.longitude, name: spot.name,
        region: spot.region, country: spot.country, id: spot.id,
        level: spot.recommendedLevel, hasData: true,
        score: f.currentScore.toFixed(1), color: scoreColor(f.currentScore),
        label: scoreShort(f.currentScore),
        swell: f.currentCondition.swellHeight.toFixed(1) + 'm',
        wind: f.currentCondition.windSpeed.toFixed(0) + ' km/h',
      };
    }
    const levelColors: Record<string, string> = { beginner: '#4A90FF', intermediate: '#FFB84D', expert: '#FF5A5A' };
    return {
      lat: spot.latitude, lon: spot.longitude, name: spot.name,
      region: spot.region, country: spot.country, id: spot.id,
      level: spot.recommendedLevel, hasData: false, score: '—',
      color: levelColors[spot.recommendedLevel] || '#888',
      label: spot.recommendedLevel === 'beginner' ? 'Debutant' : spot.recommendedLevel === 'intermediate' ? 'Intermediaire' : 'Expert',
      swell: '—', wind: '—',
    };
  });
}

function getCountryBounds(country: string): { lat: number; lon: number }[] {
  return SPOTS.filter(s => s.country === country).map(s => ({ lat: s.latitude, lon: s.longitude }));
}

function buildMapHtml(
  spots: MapSpot[],
  tileSrc: string,
  bgColor: string,
  accentColor: string,
  userLat?: number,
  userLon?: number,
  focusBounds?: { lat: number; lon: number }[],
  darkContrast?: boolean,
  focusSpotCenter?: { lat: number; lon: number },
): string {
  const spotsJson = JSON.stringify(spots);

  let initView: string;
  if (focusSpotCenter) {
    initView = `map.setView([${focusSpotCenter.lat}, ${focusSpotCenter.lon}], 11);`;
  } else if (focusBounds && focusBounds.length > 0) {
    const boundsJson = JSON.stringify(focusBounds.map(b => [b.lat, b.lon]));
    initView = `map.fitBounds(${boundsJson}, { padding: [40, 40], maxZoom: 8 });`;
  } else if (userLat != null && userLon != null) {
    initView = `map.setView([${userLat}, ${userLon}], 6);`;
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
  body { background: ${bgColor}; }
  #map { width: 100vw; height: 100vh; ${darkContrast ? 'filter: contrast(1.14) brightness(1.12);' : ''} }
  .leaflet-popup-content-wrapper {
    background: ${bgColor} !important; color: #EAEEF6 !important;
    border-radius: 14px !important; border: 1px solid rgba(128,128,128,0.2);
    box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
  }
  .leaflet-popup-tip { background: ${bgColor} !important; }
  .popup-title { font-size: 15px; font-weight: 800; margin-bottom: 3px; }
  .popup-region { font-size: 11px; opacity: 0.5; margin-bottom: 6px; }
  .popup-score { font-size: 20px; font-weight: 900; margin-bottom: 2px; }
  .popup-label { font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .popup-row { display: flex; gap: 12px; font-size: 13px; opacity: 0.7; margin-top: 6px; }
  .popup-nodata { font-size: 12px; opacity: 0.5; margin-top: 6px; font-style: italic; }
  .popup-loading { font-size: 12px; color: ${accentColor}; margin-top: 6px; font-weight: 600; }
  .popup-btn {
    display: block; margin-top: 10px; padding: 8px; border-radius: 10px;
    background: rgba(0,212,170,0.15); color: ${accentColor}; text-align: center;
    font-weight: 700; font-size: 13px; cursor: pointer; border: none; width: 100%;
  }
  .popup-btn:disabled { opacity: 0.4; }
  .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
    background: rgba(0,212,170,0.2) !important;
  }
  .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
    background: rgba(0,212,170,0.6) !important;
    color: #fff !important; font-weight: 800 !important; font-size: 13px !important;
  }
  .recenter-btn {
    position: fixed; bottom: 24px; right: 16px; z-index: 9999;
    width: 44px; height: 44px; border-radius: 22px;
    background: ${bgColor}; border: 2px solid rgba(128,128,128,0.3);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3); cursor: pointer;
    font-size: 20px; color: ${accentColor};
  }
  .recenter-btn:active { opacity: 0.7; }
</style>
</head>
<body>
<div id="map"></div>
${(userLat != null && userLon != null) ? '<button class="recenter-btn" onclick="recenter()">&#x1f4cd;</button>' : ''}
<script>
var USER_LAT = ${userLat ?? 'null'};
var USER_LON = ${userLon ?? 'null'};
var spotMarkers = {};

var map = L.map('map', { zoomControl: false, attributionControl: false });
L.tileLayer('${tileSrc}', { maxZoom: 18 }).addTo(map);
${initView}

if (USER_LAT !== null) {
  var userIcon = L.divIcon({
    className: 'user-icon',
    html: '<div style="width:18px;height:18px;border-radius:50%;background:#4A90FF;border:3px solid white;box-shadow:0 2px 10px rgba(74,144,255,0.6)"></div>',
    iconSize: [18, 18], iconAnchor: [9, 9]
  });
  L.marker([USER_LAT, USER_LON], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
}

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
      '<button class="popup-btn" onclick="sendMsg(\\'detail\\',\\'' + s.id + '\\')">Voir details</button></div>';
  }
  return '<div>' +
    '<div class="popup-title">' + s.name + '</div>' +
    '<div class="popup-region">' + s.region + ' \\u00b7 ' + s.country + '</div>' +
    '<div class="popup-label" style="color:' + s.color + '">' + s.label + '</div>' +
    '<div class="popup-nodata">Conditions non charg\\u00e9es</div>' +
    '<button class="popup-btn" id="btn-' + s.id + '" onclick="sendMsg(\\'load\\',\\'' + s.id + '\\')">Charger les conditions</button></div>';
}

function sendMsg(action, id) {
  if (action === 'load') {
    var btn = document.getElementById('btn-' + id);
    if (btn) { btn.disabled = true; btn.textContent = 'Chargement...'; }
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({action: action, id: id}));
}

function updateSpot(data) {
  var entry = spotMarkers[data.id];
  if (!entry) return;
  var s = data;
  var icon = L.divIcon({
    className: 'spot-div-icon',
    html: '<div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto">' +
      '<div style="padding:3px 7px;border-radius:10px;font-size:13px;font-weight:800;color:#0B0F1A;text-align:center;min-width:36px;background:' + s.color + ';box-shadow:0 2px 8px rgba(0,0,0,0.3)">' + s.score + '</div>' +
      '<div style="margin-top:2px;font-size:9px;color:#EAEEF6;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis">' + s.name + '</div></div>',
    iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -28]
  });
  entry.marker.setIcon(icon);
  s.hasData = true;
  entry.data = s;
  entry.marker.setPopupContent(makePopup(s));
}

var spots = ${spotsJson};
var clusters = L.markerClusterGroup({
  maxClusterRadius: 50, spiderfyOnMaxZoom: true,
  showCoverageOnHover: false, zoomToBoundsOnClick: true,
  disableClusteringAtZoom: 10
});

spots.forEach(function(s) {
  var dotSize = s.hasData ? '36px' : '28px';
  var fontSize = s.hasData ? '13px' : '10px';
  var opacity = s.hasData ? '1' : '0.7';
  var content = s.hasData ? s.score : s.label.charAt(0);
  var border = s.hasData ? 'none' : '2px dashed ' + s.color;
  var bg = s.hasData ? s.color : 'transparent';
  var txtColor = s.hasData ? '#0B0F1A' : s.color;

  var icon = L.divIcon({
    className: 'spot-div-icon',
    html: '<div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;opacity:' + opacity + '">' +
      '<div style="padding:3px 7px;border-radius:10px;font-size:' + fontSize + ';font-weight:800;color:' + txtColor + ';text-align:center;min-width:' + dotSize + ';background:' + bg + ';border:' + border + ';box-shadow:0 2px 8px rgba(0,0,0,0.3)">' + content + '</div>' +
      '<div style="margin-top:2px;font-size:9px;color:#EAEEF6;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis">' + s.name + '</div></div>',
    iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -28]
  });

  var marker = L.marker([s.lat, s.lon], { icon: icon })
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
  const { colors } = useTheme();
  const { profile } = useProfile();
  const { location } = useLocation();
  const { locale } = useI18n();
  const [mapLoading, setMapLoading] = useState(true);
  const [loadingSpot, setLoadingSpot] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(() => getStoredForecasts().length);
  const webviewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const forecastsRef = useRef<SpotForecast[]>(getStoredForecasts());

  const focusCountry = route.params?.focusCountry;
  const focusSpotId = route.params?.focusSpotId;

  const initialForecastMap = useMemo(() => {
    const m = new Map<string, SpotForecast>();
    for (const f of forecastsRef.current) m.set(f.spot.id, f);
    return m;
  }, []);

  const initialSpots = useMemo(() => buildAllMapSpots(initialForecastMap), [initialForecastMap]);

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

  const html = useMemo(
    () => buildMapHtml(initialSpots, colors.mapTile, colors.bg, colors.accent, location?.latitude, location?.longitude, focusBounds, colors.mapContrast, focusSpotCenter),
    [initialSpots, colors.mapTile, colors.bg, colors.accent, location, focusBounds, colors.mapContrast, focusSpotCenter],
  );

  const loadSpotOnMap = useCallback(async (spotId: string) => {
    const spot = SPOTS.find(s => s.id === spotId);
    if (!spot) return;
    setLoadingSpot(spotId);
    try {
      const { marine, weather } = await fetchSpotData(spot.latitude, spot.longitude);
      const forecast = computeSpotForecast(spot, marine, weather, profile, locale);

      forecastsRef.current = [...forecastsRef.current.filter(f => f.spot.id !== spotId), forecast]
        .sort((a, b) => b.currentScore - a.currentScore);
      setStoredForecasts(forecastsRef.current);
      setLoadedCount(forecastsRef.current.length);

      const updateData = {
        id: spot.id,
        name: spot.name,
        region: spot.region,
        country: spot.country,
        score: forecast.currentScore.toFixed(1),
        color: scoreColor(forecast.currentScore),
        label: scoreShort(forecast.currentScore),
        swell: forecast.currentCondition ? forecast.currentCondition.swellHeight.toFixed(1) + 'm' : '—',
        wind: forecast.currentCondition ? forecast.currentCondition.windSpeed.toFixed(0) + ' km/h' : '—',
      };

      webviewRef.current?.injectJavaScript(`updateSpot(${JSON.stringify(updateData)}); true;`);
    } catch {
      webviewRef.current?.injectJavaScript(`
        var btn = document.getElementById('btn-${spotId}');
        if (btn) { btn.disabled = false; btn.textContent = 'Erreur - Réessayer'; }
        true;
      `);
    } finally {
      setLoadingSpot(null);
    }
  }, [profile]);

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.action === 'detail') {
        const f = forecastsRef.current.find(fc => fc.spot.id === msg.id);
        if (f) {
          const idx = forecastsRef.current.findIndex(fc => fc.spot.id === msg.id);
          navigation.navigate('SpotDetail', { forecast: f, spotIndex: idx >= 0 ? idx : 0 });
        }
      } else if (msg.action === 'load') {
        loadSpotOnMap(msg.id);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      log.warn('Map message parse error:', msg);
    }
  }, [navigation, loadSpotOnMap]);

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={s.hCenter}>
          <Text style={[s.title, { color: colors.white }]}>
            {focusSpotId ? SPOTS.find(s => s.id === focusSpotId)?.name : focusCountry ? focusCountry : 'Carte mondiale'}
          </Text>
          <Text style={[s.hSub, { color: colors.white40 }]}>
            {SPOTS.length} spots · {loadedCount} chargés
            {loadingSpot ? ' · Chargement…' : ''}
          </Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <WebView
          ref={webviewRef}
          source={{ html }}
          style={{ flex: 1, backgroundColor: colors.bg }}
          originWhitelist={['https://*', 'http://*']}
          javaScriptEnabled
          onMessage={onMessage}
          onLoadEnd={() => setMapLoading(false)}
          scrollEnabled={false}
          bounces={false}
        />
        {mapLoading && (
          <View style={[s.loaderOverlay, { backgroundColor: colors.bg }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[s.loaderTxt, { color: colors.white40 }]}>Chargement de la carte…</Text>
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
  loaderOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  loaderTxt: { marginTop: 12, fontSize: 13, fontWeight: '500' },
});

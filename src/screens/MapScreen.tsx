import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../context/ThemeContext';
import { SpotForecast } from '../types';
import { scoreColor, scoreShort } from '../theme';
import { MapScreenProps } from '../navigation/types';

function buildMapHtml(forecasts: SpotForecast[], tileSrc: string, bgColor: string): string {
  const markers = forecasts.map((f) => {
    const color = scoreColor(f.currentScore);
    const label = scoreShort(f.currentScore);
    const score = f.currentScore.toFixed(1);
    const swell = f.currentCondition ? f.currentCondition.swellHeight.toFixed(1) : '?';
    const wind = f.currentCondition ? f.currentCondition.windSpeed.toFixed(0) : '?';
    return `{
      lat: ${f.spot.latitude},
      lon: ${f.spot.longitude},
      name: ${JSON.stringify(f.spot.name)},
      region: ${JSON.stringify(f.spot.region)},
      score: "${score}",
      label: ${JSON.stringify(label)},
      color: "${color}",
      swell: "${swell}m",
      wind: "${wind} km/h",
      id: ${JSON.stringify(f.spot.id)}
    }`;
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: ${bgColor}; }
  #map { width: 100vw; height: 100vh; }
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
  .popup-btn {
    display: block; margin-top: 10px; padding: 8px; border-radius: 10px;
    background: rgba(0,212,170,0.15); color: #00D4AA; text-align: center;
    font-weight: 700; font-size: 13px; cursor: pointer; border: none; width: 100%;
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map', {
  center: [38.85, -9.25],
  zoom: 9,
  zoomControl: false,
  attributionControl: false
});

L.tileLayer('${tileSrc}', { maxZoom: 18 }).addTo(map);

var spots = [${markers.join(',')}];

spots.forEach(function(s) {
  var icon = L.divIcon({
    className: 'spot-div-icon',
    html: '<div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto">' +
          '<div style="padding:4px 8px;border-radius:10px;font-size:13px;font-weight:800;color:#0B0F1A;text-align:center;min-width:36px;background:' + s.color + ';box-shadow:0 2px 8px rgba(0,0,0,0.4)">' + s.score + '</div>' +
          '<div style="margin-top:2px;font-size:10px;color:#EAEEF6;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap">' + s.name + '</div></div>',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -30]
  });

  var popup = '<div>' +
    '<div class="popup-title">' + s.name + '</div>' +
    '<div class="popup-region">' + s.region + '</div>' +
    '<div class="popup-score" style="color:' + s.color + '">' + s.score + '/10</div>' +
    '<div class="popup-label" style="color:' + s.color + '">' + s.label + '</div>' +
    '<div class="popup-row">' +
      '<span>🌊 ' + s.swell + '</span>' +
      '<span>💨 ' + s.wind + '</span>' +
    '</div>' +
    '<button class="popup-btn" onclick="window.ReactNativeWebView.postMessage(\\'' + s.id + '\\')">Voir détails</button>' +
  '</div>';

  L.marker([s.lat, s.lon], { icon: icon })
    .addTo(map)
    .bindPopup(popup, { closeButton: false, minWidth: 160 });
});

if (spots.length > 0) {
  map.fitBounds(spots.map(function(s) { return [s.lat, s.lon]; }), { padding: [40, 40] });
}
</script>
</body>
</html>`;
}

export default function MapScreen({ route, navigation }: MapScreenProps) {
  const forecasts: SpotForecast[] = route.params?.forecasts || [];
  const { colors } = useTheme();
  const [mapLoading, setMapLoading] = useState(true);

  const html = useMemo(() => buildMapHtml(forecasts, colors.mapTile, colors.bg), [forecasts, colors.mapTile, colors.bg]);

  const onMessage = (event: any) => {
    const spotId = event.nativeEvent.data;
    const f = forecasts.find(fc => fc.spot.id === spotId);
    if (f) navigation.navigate('SpotDetail', { forecast: f });
  };

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.back, { backgroundColor: colors.cardLight }]}>
          <Text style={[s.backTxt, { color: colors.white }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.white }]}>Carte des spots</Text>
        <View style={{ width: 38 }} />
      </View>
      <View style={{ flex: 1 }}>
        <WebView
          source={{ html }}
          style={{ flex: 1, backgroundColor: colors.bg }}
          originWhitelist={['*']}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  back: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  backTxt: { fontSize: 24, fontWeight: '300', marginTop: -2 },
  title: { fontSize: 18, fontWeight: '800' },
  loaderOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  loaderTxt: { marginTop: 12, fontSize: 13, fontWeight: '500' },
});

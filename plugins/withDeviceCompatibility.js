// Local Expo config plugin.
//
// Declaring ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION makes the Play Store
// *implicitly* assume the app REQUIRES the GPS + location hardware features, and
// React Native also implies a required touchscreen. That silently drops a huge
// chunk of the device catalog (tablets without GPS, Chromebooks, Android Auto,
// Android XR, TV…), which is exactly the "supported devices dropped to 0 / -100%"
// symptom in the Play Console.
//
// SpotWave only needs location as a nice-to-have (find nearby spots) — it works
// perfectly fine without it. So we explicitly declare every hardware feature as
// `required="false"` to keep the widest possible device compatibility.
const { withAndroidManifest } = require('@expo/config-plugins');

const OPTIONAL_FEATURES = [
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.location.network',
  'android.hardware.touchscreen',
  'android.hardware.faketouch',
  'android.hardware.wifi',
];

module.exports = function withDeviceCompatibility(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!Array.isArray(manifest['uses-feature'])) {
      manifest['uses-feature'] = [];
    }
    const features = manifest['uses-feature'];

    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find((f) => f.$ && f.$['android:name'] === name);
      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        features.push({ $: { 'android:name': name, 'android:required': 'false' } });
      }
    }

    // Large-screen compatibility (tablets, Chromebooks, foldables, Android XR):
    // mark the app resizeable so it isn't letterboxed / flagged as incompatible
    // with multi-window and large displays. This clears the Play Console
    // "large screen restrictions" warning while the UI stays portrait on phones.
    const application = manifest.application && manifest.application[0];
    if (application) {
      application.$ = application.$ || {};
      application.$['android:resizeableActivity'] = 'true';
    }

    return cfg;
  });
};

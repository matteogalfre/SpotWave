import AsyncStorage from '@react-native-async-storage/async-storage';

const FAV_KEY = '@spotwave_favorites';

export async function getFavorites(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(FAV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function toggleFavorite(spotId: string): Promise<string[]> {
  const favs = await getFavorites();
  const idx = favs.indexOf(spotId);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push(spotId);
  }
  await AsyncStorage.setItem(FAV_KEY, JSON.stringify(favs));
  return favs;
}
